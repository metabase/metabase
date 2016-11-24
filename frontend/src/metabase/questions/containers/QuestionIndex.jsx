import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Input from "metabase/components/Input";

import NewEntityList from "./NewEntityList";

import { selectSection } from "../questions";

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
        <Icon
            name="add"
            width="32"
            height="32"
        />
        <h3>New collection</h3>
    </Link>


const Collection = ({ name, color }) =>
    <Link
        className="block p4 text-centered text-brand-hover rounded"
        style={{
            backgroundColor: '#FAFAFB',
            textDecoration: 'none'
        }}
        to={`/questions/collections/${name}`}i
    >
        { /* TODO rename this icon name  to collections or something more appropriate */ }
        <Icon
            className="mb4"
            name="all"
            width="32"
            height="32"
            style={{ color }}
        />
        <h3>{ name }</h3>
    </Link>


const QuestionCollections = ({
    collections = [
        { name: 'Collection 1', color: '#212121' },
        { name: 'Collection 2', color: 'blue'}
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
                <QuestionCollections />
                <div className="mt4">
                    { /* TODO we need to conditionally show 'Questions' if the user is not an admin and there are no collections  */ }
                    <EntityList />
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
