import { CodeEditor } from "metabase/common/components/CodeEditor";

import S from "./StatusDetails.module.css";

type StatusDetailsProps = {
  details: string;
};

export function StatusDetails({ details }: StatusDetailsProps) {
  return (
    <div className={S.codeContainer}>
      <CodeEditor value={details} readOnly />
    </div>
  );
}
