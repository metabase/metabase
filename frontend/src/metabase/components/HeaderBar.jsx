import React, { Component } from "react";

import InputBlurChange from "metabase/components/InputBlurChange.jsx";
import TitleAndDescription from "metabase/components/TitleAndDescription.jsx";
import { t } from "c-3po";
import cx from "classnames";

export default class Header extends Component {
  static defaultProps = {
    buttons: null,
    className: "py1 lg-py2 xl-py3 wrapper",
    breadcrumb: null,
  };

  render() {
    const {
      isEditing,
      name,
      description,
      breadcrumb,
      buttons,
      className,
      badge,
    } = this.props;

    let titleAndDescription;
    if (isEditing) {
      titleAndDescription = (
        <div className="Header-title flex flex-column flex-full bordered rounded my1">
          <InputBlurChange
            className="AdminInput text-bold border-bottom rounded-top h3"
            type="text"
            value={name}
            onChange={e =>
              this.props.setItemAttributeFn("name", e.target.value)
            }
          />
          <InputBlurChange
            className="AdminInput rounded-bottom h4"
            type="text"
            value={description}
            onChange={e =>
              this.props.setItemAttributeFn("description", e.target.value)
            }
            placeholder={t`No description yet`}
          />
        </div>
      );
    } else {
      if (name && description) {
        titleAndDescription = (
          <TitleAndDescription title={name} description={description} />
        );
      } else {
        titleAndDescription = (
          <div className="flex align-baseline">
            <h1 className="Header-title-name my1">{name}</h1> {breadcrumb}
          </div>
        );
      }
    }

    return (
      // TODO Atte Keinänen 5/16/17 Take care of the mobile layout with the multimetrics UI
      <div
        className={cx(
          "QueryBuilder-section pt2 sm-pt2 flex align-center",
          className,
        )}
      >
        <div className={cx("relative flex-full")}>
          {titleAndDescription}
          {badge && <div>{badge}</div>}
        </div>

        <div className="flex-align-right hide sm-show">{buttons}</div>
      </div>
    );
  }
}
