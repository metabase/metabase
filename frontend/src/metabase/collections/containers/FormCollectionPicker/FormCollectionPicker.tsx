import {
  useCallback,
  useEffect,
  useState,
  useRef,
  HTMLAttributes,
} from "react";
import { t } from "ttag";
import { useField } from "formik";

import { useUniqueId } from "metabase/hooks/use-unique-id";

import FormField from "metabase/core/components/FormField";
import SelectButton from "metabase/core/components/SelectButton";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import CollectionName from "metabase/containers/CollectionName";
import SnippetCollectionName from "metabase/containers/SnippetCollectionName";

import Collections from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";

import { isValidCollectionId } from "metabase/collections/utils";

import type { CollectionId } from "metabase-types/api";

import {
  PopoverItemPicker,
  MIN_POPOVER_WIDTH,
  NewCollectionButton,
} from "./FormCollectionPicker.styled";

interface NewCollectionProps {
  isDisabled: boolean;
  onClick: () => void;
}

export interface FormCollectionPickerProps
  extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
  type?: "collections" | "snippet-collections";
  newColl?: NewCollectionProps;
}

function ItemName({
  id,
  type = "collections",
}: {
  id: CollectionId;
  type?: "collections" | "snippet-collections";
}) {
  return type === "snippet-collections" ? (
    <SnippetCollectionName id={id} />
  ) : (
    <CollectionName id={id} />
  );
}

function FormCollectionPicker({
  className,
  style,
  name,
  title,
  placeholder = t`Select a collection`,
  type = "collections",
  newColl,
}: FormCollectionPickerProps) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] = useField(name);
  const formFieldRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MIN_POPOVER_WIDTH);

  useEffect(() => {
    const { width: formFieldWidth } =
      formFieldRef.current?.getBoundingClientRect() || {};
    if (formFieldWidth) {
      setWidth(formFieldWidth);
    }
  }, []);

  const renderTrigger = useCallback(
    ({ onClick: handleShowPopover }) => (
      <FormField
        className={className}
        style={style}
        title={title}
        htmlFor={id}
        error={touched ? error : undefined}
        ref={formFieldRef}
      >
        <SelectButton onClick={handleShowPopover}>
          {isValidCollectionId(value) ? (
            <ItemName id={value} type={type} />
          ) : (
            placeholder
          )}
        </SelectButton>
      </FormField>
    ),
    [id, value, type, title, placeholder, error, touched, className, style],
  );

  const renderContent = useCallback(
    ({ closePopover }) => {
      // Search API doesn't support collection namespaces yet
      const hasSearch = type === "collections";

      const entity = type === "collections" ? Collections : SnippetCollections;

      return (
        <div>
          <PopoverItemPicker
            value={{ id: value, model: "collection" }}
            models={["collection"]}
            entity={entity}
            onChange={({ id }) => {
              setValue(id);
              closePopover();
            }}
            showSearch={hasSearch}
            width={width}
          />
          {newColl && type === "collections" && (
            <NewCollectionButton
              onlyText
              icon="add"
              onClick={newColl.onClick}
              disabled={newColl.isDisabled}
            >
              {t`New collection`}
            </NewCollectionButton>
          )}
        </div>
      );
    },
    [value, type, width, setValue, newColl],
  );

  return (
    <TippyPopoverWithTrigger
      sizeToFit
      placement="bottom-start"
      renderTrigger={renderTrigger}
      popoverContent={renderContent}
      maxWidth={width}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormCollectionPicker;
