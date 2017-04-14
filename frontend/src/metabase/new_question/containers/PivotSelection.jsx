import React, { Component } from "react";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import cx from "classnames";

import ResponsiveList from "metabase/components/ResponsiveList";

import { isDate } from "metabase/lib/schema_metadata";

import { selectAndAdvance, setPivotBreakouts, setTip } from "../actions";

import { getBreakoutsForFlow, getCurrentStepTip } from "../selectors";

const mapStateToProps = state => ({
    fields: getBreakoutsForFlow(state),
    tip: getCurrentStepTip(state)
});

const mapDispatchToProps = {
    selectAndAdvance,
    setPivotBreakouts,
    setTip
};

const SelectedBreakouts = ({ breakouts, remove }) => (
    <ol>
        {breakouts.map((breakout, index) => (
            <li key={breakout.id} className="inline-block mr1">
                <div
                    className="bg-brand p1 text-white rounded flex align-center"
                >
                    {breakout.display_name}
                    <Icon
                        className="text-white"
                        name="close"
                        onClick={() => remove(index)}
                    />
                </div>
            </li>
        ))}
    </ol>
);

@connect(mapStateToProps, mapDispatchToProps)
class PivotSelection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            breakouts: []
        };
        this.tip = this.props.tip;
    }

    selectBreakout = breakout => {
        if (this.state.breakouts.length === 2) {
            return false;
        }
        return this.setState({
            breakouts: this.state.breakouts.concat([breakout])
        });
    };

    removeBreakout = index => {
        return this.setState({
            breakouts: this.state.breakouts.splice(index, 1)
        });
    };

    completeStep = () => {
        const { setPivotBreakouts, selectAndAdvance } = this.props;
        const formattedBreakouts = this.state.breakouts.map(field => {
            let x;
            console.log(field);
            if (isDate(field)) {
                x = ["datetime-field", ["field-id", field.id], "as", "day"];
            } else {
                x = ["field-id", field.id];
            }
            return x;
        });
        return selectAndAdvance(() => setPivotBreakouts(formattedBreakouts));
    };
    render() {
        const { fields } = this.props;
        const { breakouts } = this.state;
        return (
            <div>
                <div className="flex align-center">
                    Pivot by:
                    <SelectedBreakouts
                        breakouts={breakouts}
                        remove={this.removeBreakout}
                    />
                    {breakouts.length === 2 &&
                        <button
                            className="ml-auto Button Button--primary"
                            onClick={() => this.completeStep()}
                        >
                            Next
                        </button>}
                </div>

                <ResponsiveList
                    items={fields}
                    onClick={field => this.selectBreakout(field)}
                />
                {/* fields.map(field =>
                        <div
                            key={field.id}
                            className={cx(
                                "h4 py1",
                                { 'link cursor-pointer': breakouts.length < 2 },
                                { 'disabled': breakouts.length === 2 }
                            )}
                            onMouseEnter={() => setTip({ title: field.display_name, text: field.description}) }
                            onMouseLeave={() => setTip(this.tip)}
                            onClick={() => this.selectBreakout(field) }
                        >
                            {field.display_name}
                        </div>
                    ) */}
            </div>
        );
    }
}

export default PivotSelection;
