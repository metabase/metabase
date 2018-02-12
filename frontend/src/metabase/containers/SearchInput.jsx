/* @flow */

import React, { Component } from "react";
import ReactDOM from "react-dom";

import Popover from "metabase/components/Popover";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { defer } from "metabase/lib/promise";
import { debounce } from "underscore";

type LoadingState = "INIT" | "LOADING" | "LOADED";

type Props = {
    className?: string,

    value: any,
    onChange: () => void,

    autoFocus?: boolean,
    placeholder?: string,
    onFocus?: () => void,
    onBlur?: () => void,

    maxResults: number,
    search: (prefix: string, cancelled: Promise<void>) => ?[any, any][]
};

type State = {
    value: string,
    lastValue: ?string,
    suggestions: Array<[string, string]>,
    loadingState: LoadingState,
};

export default class ParameterFieldWidget extends Component<*, Props, State> {
    props: Props;
    state: State;

    _cancel: ?() => void;
    _input: ?any;

    constructor(props: Props) {
        super(props);
        this.state = {
            value: props.value || "",
            lastValue: null,
            suggestions: [],
            loadingState: "INIT",
        };
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.value !== this.props.value) {
            this.setState({ value: nextProps.value || "" });
        }
    }

    _update(value: string) {
        if (this._cancel) {
            this._cancel();
        }
        this.setState({ value }, this._search);
    }

    _search = () => {
        const { value, lastValue, suggestions } = this.state;

        // if this search is just an extension of the previous search, and the previous search
        // wasn't truncated, then we don't need to do another search because TypeaheadListing
        // will filter the previous result client-side
        if (lastValue && value.slice(0, lastValue.length) === lastValue &&
            suggestions.length < this.props.maxResults
        ) {
            return;
        }

        this.setState({
            loadingState: "INIT"
        });

        this._searchDebounced();
    }

    // $FlowFixMe
    _searchDebounced = debounce(async (): void => {
        const { value } = this.state;

        this.setState({
            loadingState: "LOADING"
        });

        const cancelDeferred = defer();
        this._cancel = () => {
            this._cancel = null;
            cancelDeferred.resolve();
        }

        let results = await this.props.search(value, cancelDeferred.promise);

        this._cancel = null;

        if (results) {
            this.setState({
                loadingState: "LOADED",
                suggestions: results,
                lastValue: value
            });
        } else {
            this.setState({
                loadingState: "INIT",
                suggestions: [],
                lastValue: value
            });
        }
    }, 500)

    render() {
        const { className, onChange } = this.props;
        const { suggestions, value, loadingState } = this.state;

        return (
            <div>
                <input
                    className={className}
                    ref={i => this._input = i}
                    value={this.state.value}
                    onInput={(e) => this._update(e.target.value)}
                    onKeyUp={(e) => {
                        if (e.keyCode === 27) {
                            e.target.blur();
                        } else if (e.keyCode === 13) {
                            onChange(this.state.value || null);
                            e.target.blur();
                        }
                    }}
                    onFocus={this.props.onFocus}
                    onBlur={this.props.onBlur}
                    placeholder={this.props.placeholder}
                    autoFocus={this.props.autoFocus}
                />
                <TypeaheadPopover
                    value={value}
                    options={suggestions}
                    loadingState={loadingState}
                    onSuggestionAccepted={(suggestion) => {
                        onChange(suggestion[0]);
                        this.setState({
                            // set the value to the display value of the selected suggestion
                            value: suggestion[1],
                            suggestions: [],
                            loadingState: "INIT",
                        });
                        if (this._input) {
                            ReactDOM.findDOMNode(this._input).blur();
                        }
                    }}
                />
            </div>
        );
    }
}

import Typeahead from "metabase/hoc/Typeahead";
import cx from "classnames";

const TypeaheadPopover = Typeahead({
    optionFilter: (value, option) => option[1].slice(0, value.length) === value,
    optionIsEqual: ([idA], [idB]) => idA === idB,
    defaultSingleSuggestion: true,
})(({
    value,
    suggestions,
    loadingState,
    onSuggestionAccepted,
    selectedSuggestion
}) => (
    <Popover
        isOpen={
            (loadingState === "LOADING") ||
            (loadingState === "LOADED" && value && suggestions.length === 0) ||
            (loadingState === "LOADED" && suggestions.length > 0)
        }
        targetOffsetY={15}
        // these two props ensure the popover doesn't jump around
        // alternatively we could give it a fixed width
        pinInitialAttachment
        horizontalAttachments={["left", "right"]}
    >
        { loadingState === "LOADING" ?
            <div className="flex align-center m2">
                <div className="mr2">
                    <LoadingSpinner size={24} />
                </div>
                <div>Searching...</div>
            </div>
        : loadingState === "LOADED" && value && suggestions.length === 0 ?
            <div className="flex align-center m2">
                No matches
            </div>
        : loadingState === "LOADED" && suggestions.length > 0 ?
            <ul className="my1">
            {suggestions.map(suggestion => (
                <li
                    className={cx("bg-brand-hover text-white-hover cursor-pointer p1 px2", {
                        "bg-brand text-white": selectedSuggestion && suggestion[0] === selectedSuggestion[0]
                    })}
                    onMouseDown={e => {
                        // prevents input from blurring prematurely
                        e.preventDefault();
                    }}
                    onClick={() => {
                        onSuggestionAccepted(suggestion);
                    }}
                >
                    <span className="text-bold">
                        {suggestion[1].slice(0, value.length)}
                    </span>
                    <span>
                        {suggestion[1].slice(value.length)}
                    </span>
                    {suggestion[0] !== suggestion[1] &&
                        <span
                            className="ml4 float-right text-bold text-grey-2"
                        >
                            {suggestion[0]}
                        </span>
                    }
                </li>
            ))}
            </ul>
        : null }
    </Popover>
));
