/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import S from "metabase/components/List.css";
import List from "metabase/components/List.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import cx from "classnames";

import {
    getEntity,
    getEntityError,
    getEntityLoading
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";

const mapStateToProps = (state, props) => ({
    entity: getEntity(state),
    loading: getEntityLoading(state),
    error: getEntityError(state)
});

const mapDispatchToProps = {
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityItem extends Component {
    static propTypes = {
        entity: PropTypes.object
    };

    render() {
        const {
            entity,
            error,
            loading
        } = this.props;

        // TODO: style this properly, currently just reusing list style
        return (
            <div className="full">
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        {entity ? entity.name : ''}
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                { () => entity ?
                    <div className="wrapper wrapper--trim">
                        <List>
                            <li className="relative">
                                <div className={cx(S.item)}>
                                    <div className={S.leftIcons}>
                                    </div>
                                    <div className={S.itemBody}>
                                        <div className={S.itemTitle}>
                                            Description
                                        </div>
                                        <div className={cx(S.itemSubtitle, { "mt1" : true })}>
                                            {entity.description || 'No description'}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        </List>
                    </div>
                    :
                    null
                }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}
