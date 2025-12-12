import { renderWithProviders } from "__support__/ui";
import type { MantineSize } from "metabase/ui";

import { type Option, ReorderableTagsInput } from "./ReorderableTagsInput";

export const mockOptions: Option[] = [
  { value: "title", label: "Title" },
  { value: "subtitle", label: "Subtitle" },
  { value: "status", label: "Status" },
  { value: "owner", label: "Owner" },
  { value: "created_at", label: "Created at" },
  { value: "updated_at", label: "Updated at" },
  { value: "count", label: "Count" },
];

interface SetupOpts {
  data?: Option[];
  value?: string[];
  onChange?: (value: string[]) => void;
  maxValues?: number;
  placeholder?: string;
  size?: MantineSize;
  containerId?: string;
  useExternalDnd?: boolean;
  draggedItemId?: string | null;
  currentDroppable?: string | null;
  "data-testid"?: string;
}

export const setup = ({
  data = mockOptions,
  value = [],
  onChange = jest.fn(),
  maxValues,
  placeholder = "Select options",
  size = "xs",
  containerId,
  useExternalDnd = false,
  draggedItemId = null,
  currentDroppable = null,
  "data-testid": dataTestId,
}: SetupOpts = {}) => {
  const props = {
    data,
    value,
    onChange,
    maxValues,
    placeholder,
    size,
    containerId,
    useExternalDnd,
    draggedItemId,
    currentDroppable,
    "data-testid": dataTestId,
  };

  const utils = renderWithProviders(<ReorderableTagsInput {...props} />);

  return {
    ...utils,
    onChange,
    props,
  };
};
