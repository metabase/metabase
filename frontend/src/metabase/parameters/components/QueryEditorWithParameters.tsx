import {
  QueryEditor,
  type QueryEditorProps,
} from "metabase/querying/editor/components/QueryEditor";

import { NativeQueryParametersList } from "./NativeQueryParametersList";
import { TemplateTagsSidebar } from "./TemplateTagsSidebar";

export type QueryEditorWithParametersProps = Omit<
  QueryEditorProps,
  "parametersList" | "templateTagsSidebar"
>;

export function QueryEditorWithParameters(
  props: QueryEditorWithParametersProps,
) {
  return (
    <QueryEditor
      {...props}
      parametersList={<NativeQueryParametersList />}
      templateTagsSidebar={TemplateTagsSidebar}
    />
  );
}
