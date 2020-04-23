import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";
import Link from "metabase/components/Link";
import SidebarSection from "./SidebarSection";
import * as Urls from "metabase/lib/urls";

import { color } from "metabase/lib/colors";

export default class RecentViews extends Component {
  static propTypes = {
    fetchRecentViews: PropTypes.func.isRequired,
    recentViews: PropTypes.array.isRequired,
  };

  static defaultProps = {
    recentViews: [],
  };

  async componentDidMount() {
    this.props.fetchRecentViews();
  }

  getIconName({ model, model_object }) {
    if (model === "card" && "display" in model_object) {
      return model_object.display;
    } else if (model === "dashboard") {
      return "dashboard";
    } else {
      return null;
    }
  }

  render() {
    const { recentViews } = this.props;
    return (
      <SidebarSection title={t`Recently Viewed`} icon="clock">
        {recentViews.length > 0 ? (
          <ul className="p2">
            {recentViews.map((item, index) => {
              const iconName = this.getIconName(item);
              return (
                <li key={index} className="py1 ml1 flex align-center clearfix">
                  <Icon
                    name={iconName}
                    size={18}
                    style={{
                      color:
                        iconName === "dashboard"
                          ? color("dashboard")
                          : color("brand"),
                    }}
                  />
                  <Link
                    to={Urls.modelToUrl(item.model, item.model_id)}
                    data-metabase-event={
                      "Recent Views;" + item.model + ";" + item.cnt
                    }
                    ml={1}
                    className="link overflow-hidden"
                  >
                    <Ellipsified>{item.model_object.name}</Ellipsified>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-column layout-centered text-normal text-light">
            <p
              className="p3 text-centered text-light"
              style={{ maxWidth: "100%" }}
            >
              {t`You haven't looked at any dashboards or questions recently`}
            </p>
          </div>
        )}
      </SidebarSection>
    );
  }
}
