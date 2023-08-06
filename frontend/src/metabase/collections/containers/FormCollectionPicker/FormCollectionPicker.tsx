import {
  useCallback,
  useEffect,
  useState,
  useRef,
  HTMLAttributes,
  useContext,
} from "react";
import { t } from "ttag";
import { useField, useFormikContext } from "formik";

import { useUniqueId } from "metabase/hooks/use-unique-id";

import FormField from "metabase/core/components/FormField";
import SelectButton from "metabase/core/components/SelectButton";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import CollectionName from "metabase/containers/CollectionName";
import SnippetCollectionName from "metabase/containers/SnippetCollectionName";
import { CreateCollectionOnTheGoButtonContext } from "metabase/containers/CreateCollectionOnTheGo";

import Collections from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";

import { isValidCollectionId } from "metabase/collections/utils";

import type { CollectionId } from "metabase-types/api";

import { ButtonProps } from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import {
  PopoverItemPicker,
  MIN_POPOVER_WIDTH,
  NewButton,
} from "./FormCollectionPicker.styled";

export interface FormCollectionPickerProps
  extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
  type?: "collections" | "snippet-collections";
  canCreateNew?: boolean;
  initialOpenCollectionId?: CollectionId;
  onOpenCollectionChange?: (collectionId: CollectionId) => void;
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

export const NewCollectionButton = (props: ButtonProps) => {
  const button = (
    <NewButton light icon="add" {...props}>
      {t`New collection`}
    </NewButton>
  );
  // button has to be wrapped in a span when disabled or the tooltip doesn’t show
  return props.disabled === true ? (
    <Tooltip tooltip={t`You must first fix the required fields above.`}>
      <span>{button}</span>
    </Tooltip>
  ) : (
    button
  );
};

function FormCollectionPicker({
  className,
  style,
  name,
  title,
  placeholder = t`Select a collection`,
  type = "collections",
  canCreateNew = false,
  initialOpenCollectionId,
  onOpenCollectionChange,
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

  const formik = useFormikContext();
  const [openCollectionId, setOpenCollectionId] = useState<
    CollectionId | undefined
  >(undefined);
  const CreateCollectionOnTheGoButton = useContext(
    CreateCollectionOnTheGoButtonContext,
  );

  const renderContent = useCallback(
    ({ closePopover }) => {
      // Search API doesn't support collection namespaces yet
      const hasSearch = type === "collections";

      const entity = type === "collections" ? Collections : SnippetCollections;

      return (
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
          initialOpenCollectionId={initialOpenCollectionId}
          onOpenCollectionChange={(id: CollectionId) => {
            onOpenCollectionChange?.(id);
            setOpenCollectionId(id);
          }}
        >
          {canCreateNew && (
            <CreateCollectionOnTheGoButton
              resumedValues={formik.values}
              openCollectionId={openCollectionId}
            />
          )}
        </PopoverItemPicker>
      );
    },
    [
      value,
      type,
      width,
      setValue,
      initialOpenCollectionId,
      openCollectionId,
      formik.values,
      onOpenCollectionChange,
      canCreateNew,
      CreateCollectionOnTheGoButton,
    ],
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
