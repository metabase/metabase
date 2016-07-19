/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import moment from "moment";

import visualizations from "metabase/visualizations";

import S from "metabase/components/List.css";
import List from "metabase/components/List.jsx";
import Icon from "metabase/components/Icon.jsx";
import Item from "metabase/components/Item.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import cx from "classnames";

import {
    getSection,
    getData,
    getUser,
    getError,
    getLoading
} from "../selectors";

import * as metadataActions from "metabase/redux/metadata";

const mapStateToProps = (state, props) => ({
    section: getSection(state),
    entities: getData(state),
    user: getUser(state),
    loading: getLoading(state),
    loadingError: getError(state)
});

const mapDispatchToProps = {
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceEntityList extends Component {
    static propTypes = {
        style: PropTypes.object.isRequired,
        entities: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        loadingError: PropTypes.object
    };

    render() {
        const {
            entities,
            user,
            style,
            section,
            loadingError,
            loading
        } = this.props;

        return (
            <div style={style} className="full">
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        <div className={cx("pb2", S.leftIcons)}>
                            { section.headerIcon &&
                                <Icon
                                    className="text-brand"
                                    name={section.headerIcon}
                                    width={24}
                                    height={24}
                                />
                            }
                        </div>
                        <div className={S.headerBody}>
                            {section.name}
                        </div>
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!loadingError && loading} error={loadingError}>
                { () => Object.keys(entities).length > 0 ?
                    <div className="wrapper wrapper--trim">
                        <List>
                            { Object.values(entities).map((entity, index) =>
                                entity && entity.id && entity.name &&
                                    <li className="relative" key={entity.id}>
                                        <Item
                                            id={entity.id}
                                            index={index}
                                            name={entity.display_name || entity.name}
                                            description={section.type !== 'questions' ?
                                                entity.description :
                                                `Created ${moment(entity.created_at).fromNow()} by ${entity.creator.common_name}`
                                            }
                                            url={section.type !== 'questions' ?
                                                `${section.id}/${entity.id}` :
                                                `/card/${entity.id}`
                                            }
                                            icon={section.type !== 'questions' ?
                                                null :
                                                (visualizations.get(entity.display)||{}).iconName
                                            }
                                        />
                                    </li>
                            )}
                        </List>
                    </div>
                    :
                    <div className={S.empty}>
                        { section.empty &&
                            <EmptyState
                                title={section.empty.title}
                                message={user.is_superuser ?
                                    section.empty.adminMessage || section.empty.message :
                                    section.empty.message
                                }
                                icon={section.empty.icon}
                                image={section.empty.image}
                                action={user.is_superuser ?
                                    section.empty.adminAction || section.empty.action :
                                    section.empty.action
                                }
                                link={user.is_superuser ?
                                    section.empty.adminLink || section.empty.link :
                                    section.empty.link
                                }
                            />
                        }
                    </div>
                }
                </LoadingAndErrorWrapper>
            </div>
        )
    }
}
