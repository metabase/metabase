/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import Icon from "metabase/components/Icon.jsx";
import Popover from "metabase/components/Popover.jsx";
import Query from "metabase/lib/query";

import _ from "underscore";

export default class CardPicker extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false,
            inputValue: "",
            inputWidth: 300,
            collectionId: undefined,
        };

        _.bindAll(this, "onChange", "onInputChange", "onInputFocus", "onInputBlur");
    }

    static propTypes = {
        cardList: PropTypes.array.isRequired,
        onChange: PropTypes.func.isRequired
    };

    componentWillUnmount() {
        clearTimeout(this._timer);
    }

    onInputChange(e) {
        this.setState({ inputValue: e.target.value });
    }

    onInputFocus() {
        this.setState({ isOpen: true });
    }

    onInputBlur() {
        // Without a timeout here isOpen gets set to false when an item is clicked
        // which causes the click handler to not fire. For some reason this even
        // happens with a 100ms delay, but not 200ms?
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            if (!this.state.isClicking) {
                this.setState({ isOpen: false })
            } else {
                this.setState({ isClicking: false })
            }
        }, 250);
    }

    onChange(id) {
        this.props.onChange(id);
        ReactDOM.findDOMNode(this.refs.input).blur();
    }

    renderItem(card) {
        let error;
        try {
            if (Query.isBareRows(card.dataset_query.query)) {
                error = "Raw data cannot be included in pulses";
            }
        } catch (e) {}
        if (card.display === "pin_map" || card.display === "state" || card.display === "country") {
            error = "Maps cannot be included in pulses";
        }

        if (error) {
            return (
                <li key={card.id} className="px2 py1">
                    <h4 className="text-grey-2">{card.name}</h4>
                    <h4 className="text-gold mt1">{error}</h4>
                </li>
            )
        } else {
            return (
                <li key={card.id} className="List-item cursor-pointer" onClickCapture={this.onChange.bind(this, card.id)}>
                    <h4 className="List-item-title px2 py1">{card.name}</h4>
                </li>
            );
        }
    }

    // keep the modal width in sync with the input width :-/
    componentDidUpdate() {
        let { scrollWidth } = ReactDOM.findDOMNode(this.refs.input);
        if (this.state.inputWidth !== scrollWidth) {
            this.setState({ inputWidth: scrollWidth });
        }
    }

    render() {
        let { cardList } = this.props;

        let { isOpen, inputValue, inputWidth, collectionId } = this.state;

        let cardByCollectionId = _.groupBy(cardList, "collection_id");
        let collectionIds = Object.keys(cardByCollectionId);

        const collections = _.chain(cardList)
            .map(card => card.collection)
            .uniq(c => c && c.id)
            .filter(c => c)
            .sortBy("name")
            .value();

        collections.unshift({ id: null, name: "None" });

        let visibleCardList;
        if (inputValue) {
            let searchString = inputValue.toLowerCase();
            visibleCardList = cardList.filter((card) =>
                ~(card.name || "").toLowerCase().indexOf(searchString) ||
                ~(card.description || "").toLowerCase().indexOf(searchString)
            );
        } else {
            if (collectionId !== undefined) {
                visibleCardList = cardByCollectionId[collectionId];
            } else if (collectionIds.length === 1) {
                visibleCardList = cardByCollectionId[collectionIds[0]];
            }
        }

        const collection = _.findWhere(collections, { id: collectionId });
        return (
            <div className="CardPicker flex-full">
                <input
                    ref="input"
                    className="input no-focus full text-bold"
                    placeholder="Type a question name to filter"
                    value={this.inputValue}
                    onFocus={this.onInputFocus}
                    onBlur={this.onInputBlur}
                    onChange={this.onInputChange}
                />
                <Popover
                    isOpen={isOpen && cardList.length > 0}
                    hasArrow={false}
                    tetherOptions={{
                        attachment: "top left",
                        targetAttachment: "bottom left",
                        targetOffset: "0 0"
                    }}
                >
                    <div className="rounded bordered scroll-y scroll-show" style={{ width: inputWidth + "px", maxHeight: "400px" }}>
                    { visibleCardList && collectionIds.length > 1 &&
                        <div className="flex align-center text-slate cursor-pointer border-bottom p2"  onClick={(e) => {
                            this.setState({ collectionId: undefined, isClicking: true });
                        }}>
                            <Icon name="chevronleft" size={18} />
                            <h3 className="ml1">{collection && collection.name}</h3>
                        </div>
                    }
                    { visibleCardList ?
                        <ul className="List text-brand">
                            {visibleCardList.map((card) => this.renderItem(card))}
                        </ul>
                    : collections ?
                        <CollectionList>
                        {collections.map(collection =>
                            <CollectionListItem collection={collection} onClick={(e) => {
                                this.setState({ collectionId: collection.id, isClicking: true });
                            }}/>
                        )}
                        </CollectionList>
                    : null }
                    </div>
                </Popover>
            </div>
        );
    }
}

const CollectionListItem = ({ collection, onClick }) =>
    <li className="List-item cursor-pointer flex align-center py1 px2" onClick={onClick}>
        <Icon name="collection" style={{ color: collection.color }} className="Icon mr2 text-default" size={18} />
        <h4 className="List-item-title">{collection.name}</h4>
        <Icon name="chevronright" className="flex-align-right text-grey-2" />
    </li>

CollectionListItem.propTypes = {
    collection: PropTypes.object.isRequired,
    onClick: PropTypes.func.isRequired
};

const CollectionList = ({ children }) =>
    <ul className="List text-brand">
        {children}
    </ul>

CollectionList.propTypes = {
    children: PropTypes.array.isRequired
};
