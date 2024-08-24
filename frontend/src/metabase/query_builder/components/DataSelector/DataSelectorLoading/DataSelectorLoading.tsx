import Loading from "metabase/components/Loading";

import { DataSelectorSection } from "../DataSelector.styled";
import type { DataSelectorSectionHeaderProps } from "../DataSelectorSectionHeader";
import DataSelectorSectionHeader from "../DataSelectorSectionHeader";

const DataSelectorLoading = ({ header }: DataSelectorSectionHeaderProps) =>
  header ? (
    <DataSelectorSection>
      <DataSelectorSectionHeader header={header} />
      <Loading loading />
    </DataSelectorSection>
  ) : (
    <Loading loading />
  );

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DataSelectorLoading;
