import React, { Component, PropTypes } from "react";

import Modal from "metabase/components/Modal.jsx";
import Popover from "metabase/components/Popover.jsx";

import Portal from "./Portal.jsx";
import PageFlag from "./PageFlag.jsx";
import TutorialModal from "./TutorialModal.jsx";

import _ from "underscore";

export function qs(selector) {
    return document.querySelector(selector);
}

export function qsWithContent(selector, content) {
    for (let element of document.querySelectorAll(selector)) {
        if (element.textContent === content) {
            return element;
        }
    }
}

export default class Tutorial extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            step: 0,
            bouncePageFlag: false
        };

        _.bindAll(this, "close", "next", "back", "nextModal", "backModal", "mouseEventInterceptHandler");
    }

    componentWillMount() {
        ["mousedown", "mouseup", "mousemove", "click"].forEach((event) => {
            document.addEventListener(event, this.mouseEventInterceptHandler, true);
        });
    }

    componentWillUnmount() {
        ["mousedown", "mouseup", "mousemove", "click"].forEach((event) => {
            document.removeEventListener(event, this.mouseEventInterceptHandler, true);
        });
    }

    mouseEventInterceptHandler(e) {
        let step = this.props.steps[this.state.step];

        // don't intercept if we've somehow gotten into a weird state
        if (!step) {
            return;
        }

        // don't intercept on the last step
        if (this.state.step === this.props.steps.length - 1) {
            return;
        }

        // don't intercept events within the modal screens
        for (let modal of document.querySelectorAll(".TutorialModalContent")) {
            if (modal.contains(e.target)) {
                return;
            }
        }

        if (step.shouldAllowEvent && step.shouldAllowEvent(e)) {
            if (e.type === "click") {
                setTimeout(this.next, 100);
            }
            return;
        }

        if (e.type === "click" && this.refs.pageflag) {
            this.setState({ bouncePageFlag: true });
            setTimeout(() => this.setState({ bouncePageFlag: false }), 1500);
        }

        e.stopPropagation();
        e.preventDefault();
    }

    next() {
        if (this.state.step + 1 === this.props.steps.length) {
            this.close();
        } else {
            this.setState({ step: this.state.step + 1 })
        }
    }

    back() {
        this.setState({ step: Math.max(0, this.state.step - 1) })
    }

    nextModal() {
        let step = this.state.step;
        while (++step < this.props.steps.length) {
            if (this.props.steps[step].getModal) {
                this.setState({ step: step });
                return;
            }
        }
        this.close();
    }

    backModal() {
        let step = this.state.step;
        while (--step >= 0) {
            if (this.props.steps[step].getModal) {
                this.setState({ step: step });
                return;
            }
        }
        this.setState({ step: 0 });
    }

    close() {
        this.props.onClose();
    }

    render() {
        let step = this.props.steps[this.state.step];

        if (!step) {
            return <span />;
        }

        let modal;
        if (step.getModal) {
            let modalSteps = this.props.steps.filter((s) => !!s.getModal);
            let modalStepIndex = modalSteps.indexOf(step);
            modal = (
                <TutorialModal
                    modalStepIndex={modalStepIndex}
                    modalStepCount={modalSteps.length}
                    onBack={this.backModal}
                    onClose={this.close}
                >
                    {step.getModal({
                        onNext: this.next,
                        onClose: this.close
                    })}
                </TutorialModal>
            )
        }

        let pageFlagTarget, pageFlagText;
        if (step.getPageFlagTarget) {
            pageFlagTarget = step.getPageFlagTarget();
        }
        if (step.getPageFlagText) {
            pageFlagText = step.getPageFlagText();
        }

        let portalTarget;
        if (step.getPortalTarget) {
            portalTarget = step.getPortalTarget();
        }

        let onClose;
        if (this.state.step === this.props.steps.length - 1) {
            onClose = this.close;
        }

        return (
            <div>
                <PageFlag ref="pageflag" className="z5" target={pageFlagTarget} text={pageFlagText} bounce={this.state.bouncePageFlag} />
                { portalTarget &&
                    <Portal className="z2" target={portalTarget} />
                }
                <Modal isOpen={!!(modal && !step.getModalTarget)} style={{ backgroundColor: "transparent" }} className="Modal TutorialModal" onClose={onClose}>{modal}</Modal>
                <Popover isOpen={!!(modal && step.getModalTarget)} getTriggerTarget={step.getModalTarget} targetOffsetY={25} onClose={onClose} className="TutorialModal">{modal}</Popover>
            </div>
        );
    }
}
