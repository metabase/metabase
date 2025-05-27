import { t } from "ttag";

export const NamingTip = () => (
  <div
  // className={cx(
  //   CS.bordered,
  //   CS.rounded,
  //   CS.p1,
  //   CS.mt1,
  //   CS.mb2,
  //   CS.borderBrand,
  // )}
  >
    <span /* className={cx(CS.textBrand, CS.textBold)} */>{t`Tip: `}</span>
    {t`You might want to update the field name to make sure it still makes sense based on your remapping choices.`}
  </div>
);
