import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import { Motion, spring } from "react-motion";
import cx from "classnames";

// import ActionGroup from "metabase/components/ActionGroup";
import Icon from "metabase/components/Icon";
import Input from "metabase/components/Input";
import OnClickOutsideWrapper from "metabase/components//OnClickOutsideWrapper";
import Tooltip from "metabase/components/Tooltip";

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

const SEARCH_TRIGGER_KEYCODE = 191;
const SEARCH_ESCAPE_KEYCODE = 27;
const SEARCH_ENTER_KEYCODE = 13;

class Search extends Component {
    constructor () {
        super();
        this.state = { active: false }
        this.handleSearchKeydown = this.handleSearchKeydown.bind(this);
    }

    componentDidMount () {
        this.listenToSearchKeyDown();
    }

    componentWillUnMount () {
        this.stopListenToSearchKeyDown();
    }

    handleSearchKeydown (event) {
        if(this.state.active && event.keyCode === SEARCH_ENTER_KEYCODE) {
            alert('This would search if it worked');
        }

        if(event.keyCode === SEARCH_TRIGGER_KEYCODE) {
            this.setActive();
        } else if (event.keyCode === SEARCH_ESCAPE_KEYCODE) {
            this.setInactive();
        }
    }

    setActive () {
        this.setState({ active: true });
    }

    setInactive() {
        this.setState({ active: false });
    }

    listenToSearchKeyDown () {
        window.addEventListener('keydown', this.handleSearchKeydown);
    }

    stopListenToSearchKeyDown() {
        window.removeEventListener('keydown', this.handleSearchKeydown);
    }

    render () {
        const { active } = this.state;
        return (
            <OnClickOutsideWrapper handleDismissal={this.setInactive.bind(this)}>
                <div
                    className={cx(
                        'bordered border-dark flex align-center pr2 transition-border',
                        { 'border-brand' : active }
                    )}
                    onClick={ () => this.setActive() }
                    style={{
                        borderRadius: 99,
                    }}
                >
                    <Icon
                        className={cx('ml2', { 'text-brand': active })}
                        name="search"
                    />
                    <Motion
                        style={{width: active ? spring(400) : spring(200) }}
                    >
                        { interpolatingStyle =>
                            <Input
                                autofocus={active}
                                className="input text-bold borderless"
                                placeholder="Search for a question..."
                                style={interpolatingStyle}
                            />
                        }
                    </Motion>
                </div>
            </OnClickOutsideWrapper>
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
        <div>
            <div
                className="flex align-center justify-center text-brand ml-auto mr-auto mb4 mt2"
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
        </div>
        <h3 className="text-brand">New collection</h3>
    </Link>

const COLLECTION_ACTION_SIZE = 16;

const COLLECTION_ACTIONS_SIZES = {
    width: COLLECTION_ACTION_SIZE,
    height: COLLECTION_ACTION_SIZE,
};

 /*
    <ActionGroup
        actions={[
            { name: 'Set collection permissions', icon: 'lock', onClick: () => console.log('lock'), test: 'derp === 'derp' }
        ]}
        />
*/

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
        to={`/questions/collections/1`}i
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
    <ol className="Grid">
        {
            collections.map((collection, index) =>
                <li
                    className="Grid-cell"
                    key={index}
                >
                    <Collection {...collection} />
                </li>
            )
        }
        <li
            className="Grid-cell"
            onClick={
                // TODO - create a new collection
                () => console.log('New collection yo!')
            }
        >
            <NewCollection />
        </li>
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
            showPermissions: false,
            questionsExpanded: false
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
