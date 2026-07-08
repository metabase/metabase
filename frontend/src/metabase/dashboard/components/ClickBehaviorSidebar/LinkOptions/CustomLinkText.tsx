import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { TextInputBlurChange } from "metabase/ui";
import type {
  ArbitraryCustomDestinationClickBehavior,
  ClickBehavior,
} from "metabase-types/api";

import S from "./CustomLinkText.module.css";

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
      <label
        className={S.Label}
        htmlFor="link-text-template"
      >{t`Customize link text (optional)`}</label>
      <TextInputBlurChange
        id="link-text-template"
        className={cx(CS.block, CS.full)}
        placeholder={t`E.x. Details for {{Column Name}}`}
        value={clickBehavior.linkTextTemplate}
        onBlurChange={handleChange}
      />
    </div>
  );
};
