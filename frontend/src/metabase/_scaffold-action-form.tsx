/* eslint-disable boundaries/no-unknown-files, import/no-default-export */
import ActionForm from "metabase/actions/components/ActionForm/ActionForm";
import { createMockQueryAction } from "metabase-types/api/mocks";

const action = createMockQueryAction({
  parameters: [
    {
      id: "abc-123",
      name: "abc-123",
      slug: "abc-123",
      target: ["variable", ["template-tag", "abc-123"]],
      type: "type/Text",
      required: false,
    },
  ],
  visualization_settings: {
    type: "form",
    fields: {
      "abc-123": {
        id: "abc-123",
        name: "abc-123",
        title: "text input",
        order: 1,
        fieldType: "string",
        inputType: "string",
        required: false,
        hidden: false,
      },
    },
  },
});

const onSubmit = () =>
  Promise.reject({
    success: false,
    error: "Something went wrong when submitting the form.",
    message: "Something went wrong when submitting the form.",
  });

const ScaffoldActionForm = () => (
  <div style={{ maxWidth: 420, margin: "80px auto" }}>
    <ActionForm action={action} onSubmit={onSubmit} />
  </div>
);

export default ScaffoldActionForm;
