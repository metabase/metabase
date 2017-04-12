import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import { fetchDatabasesWithMetadata } from "metabase/redux/metadata";

import Icon from "metabase/components/Icon";

import Text from "metabase/components/Text";
import Tip from "../components/Tip";
import Title from "../components/Title";
import { Sidebar } from "../components/Layout";

import { back, resetNewQuestionFlow } from "../actions";

import {
    getSubtitle,
    getBack,
    getCurrentStepTip,
    getCurrentStepComponent
} from "../selectors";

const mapStateToProps = state => ({
    advance: state.newQuestion.advance,
    back: getBack(state),
    component: getCurrentStepComponent(state),
    subtitle: getSubtitle(state),
    tip: getCurrentStepTip(state),
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
            <div
                className="relative full-height"
                style={{ backgroundColor: "#FBFCFC" }}
            >
                <div
                    className={cxs({
                        display: "flex",
                        alignItems: "center",
                        paddingTop: "2em",
                        paddingBottom: "2em"
                    })}
                >
                    <div className="flex align-center">
                        {back &&
                            <div
                                className={cxs({
                                    borderRadius: 99,
                                    border: "1px solid #93A1AB",
                                    backgroundColor: "#fff",
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
                    </div>
                </div>

                <div className="flex mt4">
                    {tip &&
                        <Sidebar>
                            <Title>{title}</Title>
                            {subtitle && <Text>{subtitle}</Text>}
                            <Tip tip={tip} />
                        </Sidebar>}
                    <div className={cxs({ flex: 1 })}>
                        <div style={{ maxWidth: 640 }}>
                            <CurrentStep />
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default NewQuestion;
