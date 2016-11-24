import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Input from "metabase/components/Input";

import NewEntityList from "./NewEntityList";

import { selectSection } from "../questions";

const COLLECTION_ICON_SIZE = 64;

const mapStateToProps = (state, props) => ({
    items: state.questions.entities.cards,
    sectionId: state.questions.section
})

const mapDispatchToProps = ({
    selectSection
})

class Search extends Component {
    constructor () {
        super();
    }

    render () {
        return (
            <div
                className="bordered border-dark flex align-center pr2"
                style={{
                    borderRadius: 99,
                }}
            >
                <Icon
                    className="ml2"
                    name="search"
                />
                <Input
                    className="input borderless"
                    placeholder="Search for a question..."
                />
            </div>
        );
    }
}

const NewCollection = () =>
    <Link
        className="block p4 text-centered text-brand-hover rounded"
        style={{
            backgroundColor: '#FAFAFB',
            textDecoration: 'none'
        }}
    >
        <div
            className="flex align-center justify-center text-brand"
            style={{
                border: '2px solid #D8E8F5',
                borderRadius: COLLECTION_ICON_SIZE,
                height: COLLECTION_ICON_SIZE,
                width: COLLECTION_ICON_SIZE,
            }}
        >
            <Icon
                name="add"
                width="32"
                height="32"
            />
        </div>
        <h3 className="text-brand">New collection</h3>
    </Link>

const COLLECTION_ACTION_SIZE = 16;

const COLLECTION_ACTIONS_SIZES = {
    width: COLLECTION_ACTION_SIZE,
    height: COLLECTION_ACTION_SIZE,
};

const CollectionActions = () =>
    <div>
        <Icon
            className="mx1"
            name="lock"
            {...COLLECTION_ACTIONS_SIZES}
        />
        <Icon
            className="mx1"
            name="archive"
            {...COLLECTION_ACTIONS_SIZES}
        />
    </div>

const Collection = ({ color, name, slug }) =>
    <Link
        className="relative block p4 hover-parent text-centered text-brand-hover bg-light-blue-hover rounded mr4"
        style={{
            backgroundColor: '#FAFAFB',
            minWidth: 240,
            textDecoration: 'none',
        }}
        to={`/questions/collections/${slug}`}i
    >
        <div className="absolute top right mt2 mr2 hover-child">
            <CollectionActions />
        </div>
        { /* TODO rename this icon name  to collections or something more appropriate */ }
        <Icon
            className="mb4 mt2"
            name="all"
            width={COLLECTION_ICON_SIZE}
            height={COLLECTION_ICON_SIZE}
            style={{ color }}
        />
        <h3>{ name }</h3>
    </Link>


// TODO - clearly collections should come from real data
const QuestionCollections = ({
    collections = [
        { name: 'Important metrics', color: '#509EE3', slug: 'important-metrics' },
        { name: 'Quarterly marketing presentations', color: '#9CC177', slug: 'quarterly-marketing-presentations' },
        { name: 'Reports for execs', color: '#A989C5', slug: 'reports-for-execs' },
        { name: 'Shared marketing items', color: '#EF8C8C', slug: 'shared-marketing-items' }
    ]
}) =>
    <ol className="flex">
        {
            collections.map(collection => <li><Collection {...collection} /></li>)
        }
        <li><NewCollection /></li>
    </ol>

class PageModal extends Component {
    render () {
        const { children, close, title } = this.props;
        return (
            <div className="absolute bg-white z-force top left bottom right">
                <div className="py2">
                    <h2 className="text-centered">
                        { title }
                    </h2>
                    <div
                        className="cursor-pointer text-brand-hover ml-auto"
                        onClick={() => close() }
                    >
                        <Icon name="close" />
                    </div>
                </div>
                { children }
            </div>
        )
    }
}

@connect(mapStateToProps, mapDispatchToProps)
class QuestionIndex extends Component {
    constructor () {
        super();
        this.state = {
            showPermissions: false
        }
    }
    componentWillMount () {
        this.props.selectSection('all');
    }

    render () {
        return (
            <div className="relative mx4">
                <div className="flex align-center py4">
                    { /* TODO - check if user is an admin before showing */}
                    <h2>Collections of Questions</h2>

                    <div className="flex align-center ml-auto">
                        <Search />
                        <div
                            className="mx2"
                            onClick={() => this.setState({ showPermissions: true })}
                        >
                            <Tooltip tooltip="Set permissions for collections">
                                <Icon name="lock" />
                            </Tooltip>
                        </div>

                        <Link to="/questions/archive" className="mx2">
                            <Tooltip tooltip="Archive">
                                <Icon name="archive" />
                            </Tooltip>
                        </Link>
                    </div>
                </div>
                <div className="mb2">
                    <QuestionCollections />
                </div>
                <div className="mt4">
                    { /* TODO we need to conditionally show 'Questions' if the user is not an admin and there are no collections  */ }
                    <NewEntityList />
                </div>
                { this.state.showPermissions && (
                    <PageModal
                        close={() => this.setState({ showPermissions: false })}
                        title="CollectionPermissions"
                    />
                )}
            </div>
        )
    }
}

export default QuestionIndex;
