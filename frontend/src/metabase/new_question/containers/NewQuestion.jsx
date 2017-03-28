import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import { fetchDatabasesWithMetadata } from "metabase/redux/metadata";

import Icon from "metabase/components/Icon";

import Text from "../components/Text";
import Tip from "../components/Tip";
import Title from "../components/Title";
import { Sidebar } from "../components/Layout";

import { back, resetNewQuestionFlow } from "../actions";

import { getSubtitle } from "../selectors";

const mapStateToProps = state => ({
    advance: state.newQuestion.advance,
    back: state.newQuestion.currentStep.back,
    component: state.newQuestion.currentStep.component,
    subtitle: getSubtitle(state),
    tip: state.newQuestion.currentStep.tip,
    title: state.newQuestion.flow.title
});

const mapDispatchToProps = {
    fetchDatabasesWithMetadata,
    goBack: back,
    resetNewQuestionFlow
};

@connect(mapStateToProps, mapDispatchToProps)
class NewQuestion extends Component {
    componentDidMount() {
        this.props.resetNewQuestionFlow();
        this.props.fetchDatabasesWithMetadata();
    }
    render() {
        const { back, goBack, component, tip, title, subtitle } = this.props;
        const CurrentStep = component;
        return (
            <div className="wrapper relative py4">

                <div
                    className={cxs({
                        display: "flex",
                        alignItems: "center"
                    })}
                >
                    {back &&
                        <div
                            className={cxs({
                                borderRadius: 99,
                                border: "1px solid #93A1AB",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 52,
                                height: 52,
                                marginRight: "1em",
                                ":hover": {
                                    cursor: "pointer"
                                }
                            })}
                            onClick={() => goBack()}
                        >
                            <Icon name="chevronleft" />
                        </div>}
                    <div>
                        <Title>{title}</Title>
                        {subtitle && <Text>{subtitle}</Text>}
                    </div>
                </div>

                <div className="flex mt4">
                    <div className={cxs({ flex: 1 })}>
                        <CurrentStep />
                    </div>

                    {tip &&
                        <Sidebar>
                            <Tip tip={tip} />
                        </Sidebar>}
                </div>
            </div>
        );
    }
}

export default NewQuestion;
