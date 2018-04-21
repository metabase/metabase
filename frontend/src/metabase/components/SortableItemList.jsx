import React, { Component } from "react";
import PropTypes from "prop-types";

import "./SortableItemList.css";
import { t } from "c-3po";
import Icon from "metabase/components/Icon.jsx";
import Radio from "metabase/components/Radio.jsx";

export default class SortableItemList extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      sort: props.initialSort || "Last Modified",
    };
  }

  static propTypes = {
    items: PropTypes.array.isRequired,
    clickItemFn: PropTypes.func,
    showIcons: PropTypes.bool,
  };

  onClickItem(item) {
    if (this.props.onClickItemFn) {
      this.props.onClickItemFn(item);
    }
  }

  render() {
    var items;
    if (this.state.sort === "Last Modified") {
      items = this.props.items
        .slice()
        .sort((a, b) => b.updated_at - a.updated_at);
    } else if (this.state.sort === "Alphabetical Order") {
      items = this.props.items
        .slice()
        .sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );
    }

    return (
      <div className="SortableItemList">
        <div className="flex align-center px2 pb3 border-bottom">
          <h5 className="text-bold text-uppercase text-grey-3 ml2 mt1 mr2">
            {t`Sort by`}
          </h5>
          <Radio
            value={this.state.sort}
            options={[
              "Last Modified",
              /*"Most Popular",*/ "Alphabetical Order",
            ]}
            onChange={sort => this.setState({ sort })}
            optionNameFn={o => o}
            optionValueFn={o => o}
            optionKeyFn={o => o}
          />
        </div>

        <ul className="SortableItemList-list px2 pb2">
          {items.map(item => (
            <li key={item.id} className="border-row-divider">
              <a
                className="no-decoration flex p2"
                onClick={() => this.onClickItem(item)}
              >
                <div className="flex align-center flex-full mr2">
                  {this.props.showIcons ? (
                    <div className="mr2">
                      <Icon name={"illustration-" + item.display} size={48} />
                    </div>
                  ) : null}
                  <div className="text-brand-hover">
                    <h3 className="mb1">{item.name}</h3>
                    <h4 className="text-grey-3">
                      {item.description || t`No description yet`}
                    </h4>
                  </div>
                </div>
                {item.creator &&
                  item.updated_at && (
                    <div className="flex-align-right text-right text-grey-3">
                      <div className="mb1">
                        Saved by {item.creator.common_name}
                      </div>
                      <div>Modified {item.updated_at.fromNow()}</div>
                    </div>
                  )}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}
