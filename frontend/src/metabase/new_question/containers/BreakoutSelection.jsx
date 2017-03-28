import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";

import Card from "../components/Card";

import { selectAndAdvance, selectMetricBreakout, setTip } from "../actions";

import {
    breakoutsForDisplay,
    currentTip,
    currentStepTitle
} from "../selectors";

const mapStateToProps = state => ({
    title: currentStepTitle(state),
    breakouts: breakoutsForDisplay(state),
    tip: currentTip(state)
});

const mapDispatchToProps = {
    selectAndAdvance,
    selectMetricBreakout,
    setTip
};

@connect(mapStateToProps, mapDispatchToProps)
class BreakoutSelection extends Component {
    constructor(props) {
        super(props);
        this.tip = props.tip;
    }
    render() {
        const { title, breakouts, selectAndAdvance, setTip } = this.props;
        return (
            <div>
                <h2>{title}</h2>
                <ol>
                    {breakouts.map(
                        breakout => breakout.fields.length > 0 &&
                        breakout.show() &&
                        <li
                            className={cxs({ marginBottom: "2em" })}
                            key={breakouts.display_name}
                        >
                            <h3>{breakout.display_name}</h3>
                            <ol
                                className={cxs({
                                    display: "flex",
                                    flexWrap: "wrap"
                                })}
                            >
                                {breakout.fields.map(field => (
                                    <li
                                        onClick={() =>
                                            selectAndAdvance(
                                                () =>
                                                    selectMetricBreakout(field)
                                            )}
                                        onMouseEnter={() => {
                                            if (field.description) {
                                                setTip({
                                                    title: field.display_name,
                                                    text: field.description
                                                });
                                            }
                                            return false;
                                        }}
                                        onMouseLeave={() => setTip(this.tip)}
                                        className={cxs({
                                            flex: "0 0 33.33%",
                                            padding: "1em"
                                        })}
                                        key={field.id}
                                    >
                                        <Card color={breakout.displayColor}>
                                            <div
                                                className={cxs({
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center"
                                                })}
                                            >
                                                <Icon
                                                    className={cxs({
                                                        marginBottom: "1em"
                                                    })}
                                                    name={breakout.iconName}
                                                    size={32}
                                                />
                                                <h3>{field.display_name}</h3>
                                            </div>
                                        </Card>
                                    </li>
                                ))}
                            </ol>
                        </li>
                    )}
                </ol>
            </div>
        );
    }
}

export default BreakoutSelection;
