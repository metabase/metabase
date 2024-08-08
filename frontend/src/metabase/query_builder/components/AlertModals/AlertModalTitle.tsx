import cx from "classnames";

import CS from "metabase/css/core/index.css";

type AlertModalTitleProps = {
  text: string;
};

export const AlertModalTitle = ({ text }: AlertModalTitleProps) => (
  <div className={cx(CS.mlAuto, CS.mrAuto, CS.my4, CS.pb2, CS.textCentered)}>
    <img
      className={CS.mb3}
      src="app/assets/img/alerts/alert-bell-confetti-illustration.png"
      srcSet="
        app/assets/img/alerts/alert-bell-confetti-illustration.png    1x,
        app/assets/img/alerts/alert-bell-confetti-illustration@2x.png 2x
      "
    />
    <h1 className={CS.textDark}>{text}</h1>
  </div>
);
