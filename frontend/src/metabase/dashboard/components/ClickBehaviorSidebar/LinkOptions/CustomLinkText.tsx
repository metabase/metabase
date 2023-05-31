import { useCallback } from "react";
import * as React from "react";
import { t } from "ttag";

import InputBlurChange from "metabase/components/InputBlurChange";

import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
} from "metabase-types/api";

import { Heading } from "../ClickBehaviorSidebar.styled";

interface Props {
  clickBehavior: ArbitraryCustomDestinationClickBehavior;
  updateSettings: (settings: ClickBehavior) => void;
}

const CustomLinkText = ({ clickBehavior, updateSettings }: Props) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateSettings({
        ...clickBehavior,
        linkTextTemplate: e.target.value,
      });
    },
    [clickBehavior, updateSettings],
  );

  return (
    <div className="mt2 mb1">
      <Heading>{t`Customize link text (optional)`}</Heading>
      <InputBlurChange
        className="block full"
        placeholder={t`E.x. Details for {{Column Name}}`}
        value={clickBehavior.linkTextTemplate}
        onBlurChange={handleChange}
      />
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomLinkText;
