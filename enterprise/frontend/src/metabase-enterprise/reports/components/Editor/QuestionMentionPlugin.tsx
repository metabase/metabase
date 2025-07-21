import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { useListRecentsQuery } from "metabase/api";
import Search from "metabase/entities/search";
import { getName } from "metabase/lib/name";
import { useDispatch } from "metabase/lib/redux";
import { RecentsListContent } from "metabase/nav/components/search/RecentsList/RecentsListContent";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
import { Popover } from "metabase/ui";
import type {
  RecentItem,
  SearchModel,
  UnrestrictedLinkEntity,
} from "metabase-types/api";

const MODELS_TO_SEARCH: SearchModel[] = ["card", "dataset"];

interface QuestionMentionPluginProps {
  editor: Editor;
}

export const QuestionMentionPlugin = ({
  editor,
}: QuestionMentionPluginProps) => {
  const dispatch = useDispatch();
  const [showPopover, setShowPopover] = useState(false);
  const [query, setQuery] = useState("");
  const [mentionRange, setMentionRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const virtualRef = useRef<HTMLDivElement>(null);

  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, { refetchOnMountOrArgChange: true });

  const filteredRecents = recents
    .filter(
      (item: RecentItem) => item.model === "card" || item.model === "dataset",
    )
    .slice(0, 5);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateHandler = () => {
      const { $from } = editor.state.selection;
      const text = $from.nodeBefore?.text || "";

      // Check if we're typing after @
      if (text && text.endsWith("@")) {
        const from = $from.pos - 1;
        setMentionRange({ from, to: $from.pos });

        // Get cursor position
        const coords = editor.view.coordsAtPos(from);
        setAnchorPos({ x: coords.left, y: coords.bottom });

        setShowPopover(true);
        setQuery("");
      } else if (mentionRange && showPopover) {
        // Check if we're still in mention mode
        const currentText = editor.state.doc.textBetween(
          mentionRange.from,
          Math.min(editor.state.doc.content.size, $from.pos),
          "",
        );

        if (currentText.startsWith("@")) {
          setQuery(currentText.slice(1));
          setMentionRange({ from: mentionRange.from, to: $from.pos });
        } else {
          setShowPopover(false);
          setMentionRange(null);
        }
      }
    };

    editor.on("update", updateHandler);
    editor.on("selectionUpdate", updateHandler);

    return () => {
      editor.off("update", updateHandler);
      editor.off("selectionUpdate", updateHandler);
    };
  }, [editor, mentionRange, showPopover]);

  const handleSelect = (item: UnrestrictedLinkEntity) => {
    if (!mentionRange) {
      return;
    }

    const wrappedItem = Search.wrapEntity(item, dispatch);

    editor
      .chain()
      .focus()
      .deleteRange(mentionRange)
      .insertContent({
        type: "questionEmbed",
        attrs: {
          questionId: wrappedItem.id,
          questionName: wrappedItem.name,
          model: wrappedItem.model,
        },
      })
      .run();

    setShowPopover(false);
    setMentionRange(null);
  };

  const handleRecentSelect = (item: RecentItem) => {
    handleSelect({
      ...item,
      description: item.description ?? undefined,
      name: getName(item),
    });
  };

  // Position the virtual reference at cursor position
  useEffect(() => {
    if (virtualRef.current && anchorPos) {
      virtualRef.current.style.position = "fixed";
      virtualRef.current.style.left = `${anchorPos.x}px`;
      virtualRef.current.style.top = `${anchorPos.y}px`;
      virtualRef.current.style.width = "1px";
      virtualRef.current.style.height = "1px";
    }
  }, [anchorPos]);

  return (
    <>
      <div
        ref={virtualRef}
        style={{ position: "fixed", pointerEvents: "none" }}
      />
      <Popover
        opened={showPopover}
        position="bottom-start"
        width={320}
        shadow="md"
        withinPortal
        closeOnClickOutside={false}
        onClose={() => {
          setShowPopover(false);
          setMentionRange(null);
        }}
      >
        <Popover.Target>
          <div style={{ display: "none" }} />
        </Popover.Target>

        <Popover.Dropdown
          style={{
            position: "fixed",
            left: anchorPos?.x ?? 0,
            top: anchorPos?.y ?? 0,
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {query.length > 0 ? (
            <SearchResults
              searchText={query}
              forceEntitySelect
              onEntitySelect={handleSelect}
              models={MODELS_TO_SEARCH}
            />
          ) : (
            <RecentsListContent
              isLoading={isRecentsLoading}
              results={filteredRecents}
              onClick={handleRecentSelect}
            />
          )}
        </Popover.Dropdown>
      </Popover>
    </>
  );
};
