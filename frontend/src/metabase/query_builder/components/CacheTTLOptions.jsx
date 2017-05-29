import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import cx from "classnames";

import AddClauseButton from "./AddClauseButton.jsx";
import Expressions from "./expressions/Expressions.jsx";
import ExpressionWidget from './expressions/ExpressionWidget.jsx';
import LimitWidget from "./LimitWidget.jsx";
import SortWidget from "./SortWidget.jsx";
import Popover from "metabase/components/Popover.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";
import Query from "metabase/lib/query";
import { CardApi } from "metabase/services";
import { cancelable } from "metabase/lib/promise";

export default class CacheTTLOptions extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
          isOpen: false,
          cache_ttl: (!this.props.card || !this.props.card.name) ? 0 : (this.props.card.cache_ttl ? this.props.card.cache_ttl : 0)
        };

        _.bindAll(this, "onSave", "onGoBack", "handleChangeCacheTTL", "handleSubmitCacheTTL");
    }



    static propTypes = {
        card: PropTypes.object
    };

    onSave(data) {
        // MBQL->NATIVE
        // if we are a native query with an MBQL query definition, remove the old MBQL stuff (happens when going from mbql -> native)
        // if (card.dataset_query.type === "native" && card.dataset_query.query) {
        //     delete card.dataset_query.query;
        // } else if (card.dataset_query.type === "query" && card.dataset_query.native) {
        //     delete card.dataset_query.native;
        // }

        if (this.props.card.dataset_query.query) {
            Query.cleanQuery(this.props.card.dataset_query.query);
        }

        // TODO: reduxify
        this.requesetPromise = cancelable(CardApi.update(data));
        return this.requesetPromise.then(updatedCard => {
            if (this.props.fromUrl) {
                this.onGoBack();
                return;
            }

            this.props.notifyCardUpdatedFn(updatedCard);
        });
    }

    handleChangeCacheTTL(event) {
      this.setState({cache_ttl: event.target.value});
    }

    handleSubmitCacheTTL() {
      this.onSave({id: this.props.card.id,
                   cache_ttl: +this.state.cache_ttl > 0 ? (+this.state.cache_ttl)*60 : null});
      this.setState({ isOpen: false });
    }

    onGoBack() {
        this.props.onChangeLocation(this.props.fromUrl || "/");
    }

    renderPopover() {
        if (!this.state.isOpen) return null;

        return (
            <Popover onClose={() => this.setState({isOpen: false})}>
                <div className="p3">
                  <div>
                    <br/>
                    <div className="mb1 h6 text-uppercase text-grey-3 text-bold">Cache TTL, minutes (0 - defaults)</div>
                    <div className="flex align-center">
                      <input className="input block border-gray" type="text" defaultValue={this.props.card.cache_ttl ? this.props.card.cache_ttl/60 : 0} onChange={(e) => this.handleChangeCacheTTL(e)}/>
                      <span className="Header-buttonSection borderless">
                        <a className="ml1 cursor-pointer text-brand-hover text-grey-4 text-uppercase" onClick={this.handleSubmitCacheTTL}>DONE</a>
                      </span>
                    </div>
                  </div>
                </div>
            </Popover>
        );
    }

    render() {
        const { card, settingValues } = this.props;
        if(!settingValues['enable-query-caching']) return null;
        if(!card) return null;
        if(!card.name) return null;

        const onClick = () => this.setState({isOpen: true});

        return (
            <div className="GuiBuilder-section GuiBuilder-sort-limit flex align-center">
                <span className={cx("EllipsisButton no-decoration text-grey-1 px1", {"cursor-pointer": onClick})} onClick={onClick}>…</span>
                {this.renderPopover()}
            </div>
        );
    }
}
