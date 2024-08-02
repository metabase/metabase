/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { jt, t } from "ttag";

import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";

import AlertModalsS from "./AlertModals.module.css";

export class AlertEducationalScreen extends Component {
  render() {
    const { onProceed } = this.props;

    return (
      <div
        className={cx(CS.pt2, CS.pb4, CS.mlAuto, CS.mrAuto, CS.textCentered)}
      >
        <div className={CS.pt4}>
          <h1
            className={cx(CS.mb1, CS.textDark)}
          >{t`The wide world of alerts`}</h1>
          <h3
            className={cx(CS.mb4, CS.textNormal, CS.textDark)}
          >{t`There are a few different kinds of alerts you can get`}</h3>
        </div>
        {
          // @mazameli: needed to do some negative margin spacing to match the designs
        }
        <div className={cx(CS.textNormal, CS.pt3)}>
          <div
            className={cx(CS.relative, CS.flex, CS.alignCenter, CS.pr4)}
            style={{ marginLeft: -80 }}
          >
            <img
              src="app/assets/img/alerts/education-illustration-01-raw-data.png"
              srcSet="
                app/assets/img/alerts/education-illustration-01-raw-data.png    1x,
                app/assets/img/alerts/education-illustration-01-raw-data@2x.png 2x,
              "
            />
            <p
              className={cx(
                CS.ml2,
                CS.textLeft,
                AlertModalsS.AlertModalsTextWidth,
              )}
            >{jt`When a raw data question ${(
              <strong>{t`returns any results`}</strong>
            )}`}</p>
          </div>
          <div
            className={cx(
              CS.relative,
              CS.flex,
              CS.alignCenter,
              CS.flexReverse,
              CS.pl4,
            )}
            style={{ marginTop: -50, marginRight: -80 }}
          >
            <img
              src="app/assets/img/alerts/education-illustration-02-goal.png"
              srcSet="
                app/assets/img/alerts/education-illustration-02-goal.png    1x,
                app/assets/img/alerts/education-illustration-02-goal@2x.png 2x,
              "
            />
            <p
              className={cx(
                CS.mr2,
                CS.textRight,
                AlertModalsS.AlertModalsTextWidth,
              )}
            >{jt`When a line or bar ${(
              <strong>{t`crosses a goal line`}</strong>
            )}`}</p>
          </div>
          <div
            className={cx(CS.relative, CS.flex, CS.alignCenter)}
            style={{ marginTop: -60, marginLeft: -55 }}
          >
            <img
              src="app/assets/img/alerts/education-illustration-03-progress.png"
              srcSet="
                app/assets/img/alerts/education-illustration-03-progress.png    1x,
                app/assets/img/alerts/education-illustration-03-progress@2x.png 2x,
              "
            />
            <p
              className={cx(
                CS.ml2,
                CS.textLeft,
                AlertModalsS.AlertModalsTextWidth,
              )}
            >{jt`When a progress bar ${(
              <strong>{t`reaches its goal`}</strong>
            )}`}</p>
          </div>
        </div>
        <Button
          primary
          className={CS.mt4}
          onClick={onProceed}
        >{t`Set up an alert`}</Button>
      </div>
    );
  }
}
