import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { t } from "c-3po";
import { Box, Subhead } from "rebass";

import Icon from "metabase/components/Icon.jsx";
import * as Urls from "metabase/lib/urls";

import { getRecentViews } from "metabase/home/selectors";
import { fetchRecentViews } from "metabase/home/actions";

import { normal } from "metabase/lib/colors";

const mapStateToProps = state => ({
  recentViews: getRecentViews(state),
});

const mapDispatchToProps = {
  fetchRecentViews,
};

@connect(mapStateToProps, mapDispatchToProps)
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

  getIconColor({ model, model_object }) {
    if (model === "card") {
      return normal.grey2;
    } else if (model === "dashboard") {
      return normal.blue;
    } else {
      return null;
    }
  }

  render() {
    const { recentViews } = this.props;
    return (
      <Box>
        <Subhead>Recent views</Subhead>
        {recentViews.length > 0 ? (
          <ul>
            {recentViews.map((item, index) => {
              const iconName = this.getIconName(item);
              return (
                <li key={index} className="py1 flex align-center clearfix">
                  <Box style={{ backgroundColor: "#F4F5F6" }} p={1}>
                    <Icon
                      name={iconName}
                      size={18}
                      style={{ color: this.getIconColor(item) }}
                    />
                  </Box>
                  <Link
                    to={Urls.modelToUrl(item.model, item.model_id)}
                    data-metabase-event={
                      "Recent Views;" + item.model + ";" + item.cnt
                    }
                    className="ml1 flex-full text-paragraph text-bold no-decoration text-brand-hover"
                  >
                    {item.model_object.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-column layout-centered text-normal text-grey-2">
            <p
              className="p3 text-centered text-grey-2"
              style={{ maxWidth: "100%" }}
            >
              {t`You haven't looked at any dashboards or questions recently`}
            </p>
          </div>
        )}
      </Box>
    );
  }
}
