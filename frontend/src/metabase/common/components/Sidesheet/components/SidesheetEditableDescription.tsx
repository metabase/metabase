import {
  EditableDescription,
  type EditableDescriptionProps,
} from "../../EditableDescription/EditableDescription";

export const SidesheetEditableDescription = (
  props: EditableDescriptionProps,
) => <EditableDescription pos="relative" left={-4.5} {...props} />;
