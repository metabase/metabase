/* eslint-disable react/prop-types */
import { t } from "ttag";
import MappingEditor from "./MappingEditor";

const LoginAttributesWidget = ({ field }) => (
  <MappingEditor
    value={field.value || {}}
    onChange={field.onChange}
    addText={t`Add an attribute`}
  />
);

export default LoginAttributesWidget;
