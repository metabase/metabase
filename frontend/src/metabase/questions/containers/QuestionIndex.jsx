import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import { Motion, spring, presets } from "react-motion";
import Collapse from "react-collapse";

// import ActionGroup from "metabase/components/ActionGroup";
import Icon from "metabase/components/Icon";
import ExpandingSearchField from "../components/ExpandingSearchField";
import Tooltip from "metabase/components/Tooltip";

import CollectionButtons from "../components/CollectionButtons"

import EntityList from "./EntityList";

import { search } from "../questions";
import { loadCollections } from "../collections";

import { push } from "react-router-redux";

const mapStateToProps = (state, props) => ({
    items: state.questions.entities.cards,
    sectionId: state.questions.section,
    collections: state.collections.collections
})

const mapDispatchToProps = ({
    search,
    loadCollections,
    push,
})

@connect(mapStateToProps, mapDispatchToProps)
export default class QuestionIndex extends Component {
    constructor (props) {
        super(props);
        this.state = {
            // only expand the everything else section if there are no collections
            questionsExpanded: props.collections ? false : true
        }
    }
    componentWillMount () {
        this.props.loadCollections();
    }

    render () {
        const { collections, push, location } = this.props;
        const { questionsExpanded } = this.state;
        return (
            <div className="relative mx4">
                <div className="flex align-center py4">
                    { /* TODO - check if user is an admin before showing */}
                    <h2>Collections of Questions</h2>

                    <div className="flex align-center ml-auto">
                        <ExpandingSearchField className="mr2" onSearch={this.props.search} />

                        <Tooltip tooltip="Set permissions for collections">
                            <Link to="/collections/permissions" className="mx2 text-brand-hover">
                                <Icon name="lock" />
                            </Link>
                        </Tooltip>

                        <Tooltip tooltip="View the archive">
                            <Link to="/questions/archive" className="mx2 text-brand-hover">
                                <Icon name="viewArchive" />
                            </Link>
                        </Tooltip>
                    </div>
                </div>
                <div className="mb2">
                    <CollectionButtons collections={collections} />
                </div>
                <div
                    className="inline-block mt4 mb2 cursor-pointer text-brand-hover"
                    onClick={() => this.setState({ questionsExpanded: !questionsExpanded })}
                >
                    <div className="flex align-center">
                        <Motion defaultStyle={{ deg: 0 }} style={{ deg: questionsExpanded ? spring(0, presets.gentle) : spring(270, presets.gentle) }}>
                            { motionStyle =>
                                <Icon
                                    className="ml1 mr1"
                                    name="expandarrow"
                                    style={{
                                        transform: `rotate(${motionStyle.deg}deg)`
                                    }}
                                />
                            }
                        </Motion>
                        <h2>Everything Else</h2>
                    </div>`
                </div>
                <Collapse isOpened={questionsExpanded} keepCollapsedContent={true}>
                    <EntityList
                        query={{ f: "all", collection: "", ...location.query }}
                        onChangeSection={(section) => push({
                            ...location,
                            query: { ...location.query, f: section }
                        })}
                    />
                </Collapse>
            </div>
        )
    }
}
