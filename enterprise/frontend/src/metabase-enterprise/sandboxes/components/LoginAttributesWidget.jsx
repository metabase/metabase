/* eslint-disable react/prop-types */
import MappingEditor from "./MappingEditor";

const LoginAttributesWidget = ({ field }) => (
  <MappingEditor
    value={field.value || {}}
    onChange={field.onChange}
    addText="Add an attribute"
  />
);

export default LoginAttributesWidget;
