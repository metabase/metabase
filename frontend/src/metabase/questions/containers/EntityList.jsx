/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import S from "../components/List.css";

import List from "../components/List";
import SearchHeader from "../components/SearchHeader";
import ActionHeader from "../components/ActionHeader";
import UndoListing from "./UndoListing";


import { selectSection, setSearchText, setItemSelected, setAllSelected, setArchived } from "../questions";
import {
    getSection, getEntityType, getEntityIds,
    getSectionName, getSectionLoading, getSectionError,
    getSearchText,
    getVisibleCount, getSelectedCount, getAllAreSelected, getSectionIsArchive,
    getLabelsWithSelectedState
} from "../selectors";


const mapStateToProps = (state, props) => {
  return {
      sectionId:        getSection(state),
      entityType:       getEntityType(state),
      entityIds:        getEntityIds(state),
      loading:          getSectionLoading(state),
      error:            getSectionError(state),

      searchText:       getSearchText(state),

      name:             getSectionName(state),
      visibleCount:     getVisibleCount(state),
      selectedCount:    getSelectedCount(state),
      allAreSelected:   getAllAreSelected(state),
      sectionIsArchive: getSectionIsArchive(state),

      labels:           getLabelsWithSelectedState(state)
  }
}

const mapDispatchToProps = {
    setItemSelected,
    setAllSelected,
    setSearchText,
    setArchived,
    selectSection
}

const SECTIONS = [
    { section: 'all', name: 'All questions' },
    { section: 'fav', name: 'Favorites' },
    { section: 'recent', name: 'Recently viewed' },
    { section: 'mine', name: 'Saved by me' },
    { section: 'popular', name: 'Most popular' },
];

const EMPTY_STATES = {
    'All questions': {
        icon: 'all',
        message: 'No questions have been saved yet.'
    },
    'Recently viewed': {
        icon: 'recents',
        message: 'You haven\'t viewed any questions recently.'
    },
    'Saved by me': {
        icon: 'mine',
        message: 'You haven\'t saved any questions yet.'
    },
    'Favorites': {
        icon: 'star',
        message: 'You haven\'t favorited any questions yet.'
    },
    'Most popular': {
        icon: 'popular' ,
        message: 'The most viewed questions across your company will show up here.'
    },
    'Archive': {
        icon: 'archive',
        message: 'If you no longer need a question, you can archive it.'
    },
    'default': {
        icon: 'label',
        message: 'There aren\'t any questions in this section.' // TODO - this shouldn't say label
    }
}

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityList extends Component {
    static propTypes = {
        style:              PropTypes.object.isRequired,
        sectionId:          PropTypes.string.isRequired,
        name:               PropTypes.string.isRequired,
        loading:            PropTypes.bool.isRequired,
        error:              PropTypes.any,
        entityType:         PropTypes.string.isRequired,
        entityIds:          PropTypes.array.isRequired,
        searchText:         PropTypes.string.isRequired,
        setSearchText:      PropTypes.func.isRequired,
        visibleCount:       PropTypes.number.isRequired,
        selectedCount:      PropTypes.number.isRequired,
        allAreSelected:     PropTypes.bool.isRequired,
        sectionIsArchive:   PropTypes.bool.isRequired,
        labels:             PropTypes.array.isRequired,
        setItemSelected:    PropTypes.func.isRequired,
        setAllSelected:     PropTypes.func.isRequired,
        setArchived:        PropTypes.func.isRequired
    };

    componentDidUpdate(prevProps) {
        // Scroll to the top of the list if the section changed
        // A little hacky, something like https://github.com/taion/scroll-behavior might be better
        if (this.props.sectionId !== prevProps.sectionId) {
            ReactDOM.findDOMNode(this).scrollTop = 0;
        }
    }

    emptyState () {
        return EMPTY_STATES[this.props.name] || EMPTY_STATES.default;
    }

    render() {
        const {
            style,
            name, loading, error,
            entityType, entityIds,
            searchText, setSearchText,
            visibleCount, selectedCount, allAreSelected, sectionIsArchive, labels,
            setItemSelected, setAllSelected, setArchived, selectSection,
            collectionsCount
        } = this.props;
        const empty = this.emptyState();
        return (
            <div className="full" style={style}>
                <div className="full">
                    <div className="flex align-center my1" style={{height: 40}}>
                      { selectedCount > 0 ?
                        <ActionHeader
                          visibleCount={visibleCount}
                          selectedCount={selectedCount}
                          allAreSelected={allAreSelected}
                          sectionIsArchive={sectionIsArchive}
                          setAllSelected={setAllSelected}
                          setArchived={setArchived}
                          labels={labels}
                          />
                        :
                          <SearchHeader searchText={searchText} setSearchText={setSearchText} />
                      }
                      <EntityFilterWidget
                        section={name}
                        onSectionChange={selectSection}
                      />
                    </div>
                    <LoadingAndErrorWrapper className="full" loading={!error && loading} error={error}>
                    { () =>
                        entityIds.length > 0 ?
                            <List
                                entityType={entityType}
                                entityIds={entityIds}
                                setItemSelected={setItemSelected}
                            />
                        :
                            <div className={S.empty}>
                                <EmptyState message={empty.message} icon={empty.icon} />
                            </div>
                    }
                    </LoadingAndErrorWrapper>
                </div>
                <UndoListing />
            </div>
        );
    }
}

class EntityFilterWidget extends Component {
    static propTypes = {
        section: PropTypes.string.isRequired,
        onSectionChange: PropTypes.func.isRequired,
    }
    render() {
        const { section, onSectionChange } = this.props;
        return (
            <PopoverWithTrigger
                ref={p => this.popover = p}
                triggerClasses="block ml-auto"
                targetOffsetY={10}
                triggerElement={
                    <div className="flex align-center text-brand">
                        <h3>{section}</h3>
                        <Icon
                            ref={i => this.icon = i}
                            className="ml1"
                            name="chevrondown"
                            width="12"
                            height="12"
                        />
                    </div>
                }
                target={() => this.icon}
            >
                <ol className="List text-brand">
                    { SECTIONS.map((item, index) =>
                        <li
                            key={index}
                            className="List-item p1"
                            onClick={() => {
                                onSectionChange(item.section);
                                this.popover.close();
                            }}
                        >
                            <Icon name={item.name} />
                            <h4 className="List-item-title">
                                {item.name}
                            </h4>
                        </li>
                    ) }
                </ol>
            </PopoverWithTrigger>
        )
    }
}
