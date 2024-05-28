import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import InputBlurChange from "metabase/components/InputBlurChange";
import CS from "metabase/css/core/index.css";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
} from "metabase-types/api";

import { Label } from "./CustomLinkText.styled";

interface Props {
  clickBehavior: ArbitraryCustomDestinationClickBehavior;
  updateSettings: (settings: ClickBehavior) => void;
}

export const CustomLinkText = ({ clickBehavior, updateSettings }: Props) => {
  const handleChange = useCallback(
    (e: { target: HTMLInputElement }) => {
      updateSettings({
        ...clickBehavior,
        linkTextTemplate: e.target.value,
      });
    },
    [clickBehavior, updateSettings],
  );

  return (
    <div className={cx(CS.mt2, CS.mb1)}>
      <Label htmlFor="link-text-template">{t`Customize link text (optional)`}</Label>
      <InputBlurChange
        id="link-text-template"
        className={cx(CS.block, CS.full)}
        placeholder={t`E.x. Details for {{Column Name}}`}
        value={clickBehavior.linkTextTemplate}
        onBlurChange={handleChange}
      />
    </div>
  );
};
