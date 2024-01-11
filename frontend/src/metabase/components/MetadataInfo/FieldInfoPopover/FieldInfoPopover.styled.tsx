import styled from "@emotion/styled";
import FieldInfo from "metabase/components/MetadataInfo/FieldInfo";
import type Field from "metabase-lib/metadata/Field";

type FieldInfoProps = {
  field?: Field;
};

// this makes TypeScript happy until `FieldInfo` is typed
function _FieldInfo(props: FieldInfoProps) {
  return <FieldInfo {...props} />;
}

export const WidthBoundFieldInfo = styled(_FieldInfo)`
  width: 300px;
  font-size: 14px;
`;
