import { useEffect, useState } from "react";

import { locateComment } from "../../lib/locate-comment";
import type { DataAppComment } from "../../types/comments";

import S from "./CommentDock.module.css";

interface Props {
  comments: DataAppComment[];
  onSelect: (comment: DataAppComment) => void;
}

/** Re-renders markers as the page scrolls or resizes under them. */
const useViewportTick = (): void => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((tick) => tick + 1);

    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);

    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, []);
};

/** A numbered pin on each commented part of the app, in comment order. */
export const CommentMarkers = ({ comments, onSelect }: Props) => {
  useViewportTick();

  return (
    <>
      {comments.map((comment, index) => {
        const rect = locateComment(comment);

        return (
          <button
            key={comment.id}
            type="button"
            className={S.Marker}
            style={{ left: rect.x - 11, top: rect.y - 11 }}
            title={comment.body}
            onClick={() => onSelect(comment)}
          >
            {index + 1}
          </button>
        );
      })}
    </>
  );
};
