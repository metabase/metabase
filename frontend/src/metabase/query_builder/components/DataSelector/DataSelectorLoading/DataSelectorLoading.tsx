import React from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { DataSelectorSection } from "../DataSelector.styled";
import DataSelectorSectionHeader from "../DataSelectorSectionHeader";
import type { DataSelectorSectionHeaderProps } from "../DataSelectorSectionHeader";

const DataSelectorLoading = ({ header }: DataSelectorSectionHeaderProps) =>
  header ? (
    <DataSelectorSection>
      <DataSelectorSectionHeader header={header} />
      <LoadingAndErrorWrapper loading />
    </DataSelectorSection>
  ) : (
    <LoadingAndErrorWrapper loading />
  );

export default DataSelectorLoading;
