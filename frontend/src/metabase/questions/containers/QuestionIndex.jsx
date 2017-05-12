import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import TitleAndDescription from "metabase/components/TitleAndDescription";

import ExpandingSearchField from "../components/ExpandingSearchField";
import CollectionActions from "../components/CollectionActions";

import CollectionButtons from "../components/CollectionButtons"

import EntityList from "./EntityList";

import { search } from "../questions";
import { loadCollections } from "../collections";
import { getAllCollections, getAllEntities } from "../selectors";
import { getUserIsAdmin } from "metabase/selectors/user";

import { replace, push } from "react-router-redux";

export const CollectionEmptyState = () =>
    <div className="flex align-center p2 mt4 bordered border-med border-brand rounded bg-grey-0 text-brand">
        <Icon name="collection" size={32} className="mr2"/>
        <div className="flex-full">
            <h3>Create collections for your saved questions</h3>
            <div className="mt1">
                Collections help you organize your questions and allow you to decide who gets to see what.
                {" "}
                <a href="http://www.metabase.com/docs/latest/administration-guide/06-collections.html" target="_blank">
                    Learn more
                </a>
            </div>
        </div>
        <Link to="/collections/create">
            <Button primary>Create a collection</Button>
        </Link>
    </div>;

export const NoSavedQuestionsState = () =>
    <div className="mt2 flex-full flex align-center justify-center">
        <h2 className="text-grey-2 text-normal">
            You don't have any saved questions yet
        </h2>
    </div>;


export const QuestionIndexHeader = (collections, isAdmin, onSearch) => {
    const hasCollections = collections && collections.length > 0;
    const showSetPermissionsLink = isAdmin && hasCollections;

    return (<div className="flex align-center pt4 pb2">
        <TitleAndDescription title={ hasCollections ? "Collections of Questions" : "Saved Questions" }/>
        <div className="flex align-center ml-auto">
            <ExpandingSearchField className="mr2" onSearch={onSearch}/>

            <CollectionActions>
                { showSetPermissionsLink &&
                <Link to="/collections/permissions">
                    <Icon name="lock" tooltip="Set permissions for collections"/>
                </Link>
                }
                <Link to="/questions/archive">
                    <Icon name="viewArchive" tooltip="View the archive"/>
                </Link>
            </CollectionActions>
        </div>
    </div>);
};

/* connect() is in the end of this file because of the plain QuestionIndex component is used in Jest tests */
export class QuestionIndex extends Component {
    constructor (props) {
        super(props);
        this.state = {
            questionsExpanded: true
        }
    }
    componentWillMount () {
        this.props.loadCollections();
    }

    render () {
        const { questions, collections, replace, push, location, isAdmin } = this.props;
        const { questionsExpanded } = this.state;

        const hasCollections = collections && collections.length > 0;
        const hasQuestionsWithoutCollection = questions && questions.length > 0;

        const showNoCollectionsState = isAdmin && !hasCollections;
        const showNoSavedQuestionsState = !hasCollections && !hasQuestionsWithoutCollection;
        const showEverythingElseTitle = hasQuestionsWithoutCollection && hasCollections;
        const showEverythingElseContents = hasQuestionsWithoutCollection && (questionsExpanded || !showEverythingElseTitle);

        return (
            <div className={cx("relative mx4", {"full-height flex flex-column": showNoSavedQuestionsState})}>
                { showNoCollectionsState && <CollectionEmptyState /> }

                <QuestionIndexHeader collections={collections} isAdmin={isAdmin} onSearch={this.props.search} />

                { hasCollections && <CollectionButtons collections={collections} isAdmin={isAdmin} push={push} /> }

                { showNoSavedQuestionsState && <NoSavedQuestionsState /> }

                { showEverythingElseTitle && <h2 className="mt2 mb2">Everything Else</h2> }

                <div className={cx({ "hidden": !showEverythingElseContents })}>
                    {/* EntityList loads `questions` according to the query specified in the url query string */}
                    <EntityList
                        entityType="cards"
                        entityQuery={{f: "all", collection: "", ...location.query}}
                        // use replace when changing sections so back button still takes you back to collections page
                        onChangeSection={(section) => replace({
                            ...location,
                            query: {...location.query, f: section}
                        })}
                    />
                </div>
            </div>
        )
    }
}

const mapStateToProps = (state, props) => ({
    questions:   getAllEntities(state, props),
    collections: getAllCollections(state, props),
    isAdmin:     getUserIsAdmin(state, props),
});

const mapDispatchToProps = ({
    search,
    loadCollections,
    replace,
    push,
});

export default connect(mapStateToProps, mapDispatchToProps)(QuestionIndex);

