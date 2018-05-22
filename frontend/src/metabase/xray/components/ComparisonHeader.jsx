import React from "react";
import { t } from "c-3po";
import Icon from "metabase/components/Icon";
import CostSelect from "metabase/xray/components/CostSelect";

const ComparisonHeader = ({ cost }) => (
  <div className="my4 flex align-center">
    <h1 className="flex align-center">
      <Icon name="compare" className="mr1" size={32} />
      {t`Comparing`}
    </h1>
    <div className="ml-auto flex align-center">
      <h3 className="text-grey-3 mr1">{t`Fidelity`}</h3>
      <CostSelect currentCost={cost} />
    </div>
  </div>
);

export default ComparisonHeader;
