import React, { Component } from "react";
import { t } from "c-3po";
import Modal from "metabase/components/Modal.jsx";
import Popover from "metabase/components/Popover.jsx";

import Portal from "./Portal.jsx";
import PageFlag from "./PageFlag.jsx";
import TutorialModal from "./TutorialModal.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";

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

const STEP_WARNING_TIMEOUT = 60 * 1000; // 60 seconds
const STEP_SKIP_TIMEOUT = 500; // 500 ms

export default class Tutorial extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      step: 0,
      bouncePageFlag: false,
    };

    _.bindAll(
      this,
      "close",
      "next",
      "back",
      "nextModal",
      "backModal",
      "mouseEventInterceptHandler",
    );
  }

  componentWillMount() {
    ["mousedown", "mouseup", "mousemove", "click"].forEach(event => {
      document.addEventListener(event, this.mouseEventInterceptHandler, true);
    });
  }

  componentWillUnmount() {
    ["mousedown", "mouseup", "mousemove", "click"].forEach(event => {
      document.removeEventListener(
        event,
        this.mouseEventInterceptHandler,
        true,
      );
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

    if (step.shouldAllowEvent) {
      try {
        if (step.shouldAllowEvent(e)) {
          if (e.type === "click") {
            setTimeout(this.next, 100);
          }
          return;
        }
      } catch (e) {
        // intentionally do nothing
      }
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
      MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Finish");
    } else {
      this.setStep(this.state.step + 1);
    }
  }

  back() {
    this.setStep(Math.max(0, this.state.step - 1));
  }

  nextModal() {
    let step = this.state.step;
    while (++step < this.props.steps.length) {
      if (this.props.steps[step].getModal) {
        this.setStep(step);
        return;
      }
    }
    this.close();
  }

  backModal() {
    let step = this.state.step;
    while (--step >= 0) {
      if (this.props.steps[step].getModal) {
        this.setStep(step);
        return;
      }
    }
    this.setStep(0);
  }

  setStep(step) {
    if (this.state.stepTimeout != null) {
      clearTimeout(this.state.stepTimeout);
    }
    if (this.state.skipTimeout != null) {
      clearTimeout(this.state.skipTimeout);
    }
    this.setState({
      step,
      stepTimeout: setTimeout(() => {
        this.setState({ stepTimeout: null });
      }, STEP_WARNING_TIMEOUT),
      skipTimeout: setTimeout(() => {
        if (
          this.props.steps[step].optional &&
          this.getTargets(this.props.steps[step]).missingTarget
        ) {
          this.next();
        }
      }, STEP_SKIP_TIMEOUT),
    });
    MetabaseAnalytics.trackEvent("QueryBuilder", "Tutorial Step", step);
  }

  close() {
    this.props.onClose();
  }

  getTargets(step) {
    let missingTarget = false;

    let pageFlagTarget;
    if (step.getPageFlagTarget) {
      try {
        pageFlagTarget = step.getPageFlagTarget();
      } catch (e) {
        // intentionally do nothing
      }
      if (pageFlagTarget == undefined) {
        missingTarget = missingTarget || true;
      }
    }

    let portalTarget;
    if (step.getPortalTarget) {
      try {
        portalTarget = step.getPortalTarget();
      } catch (e) {
        // intentionally do nothing
      }
      if (portalTarget == undefined) {
        missingTarget = missingTarget || true;
      }
    }

    let modalTarget;
    if (step.getModalTarget) {
      try {
        modalTarget = step.getModalTarget();
      } catch (e) {
        // intentionally do nothing
      }
      if (modalTarget == undefined) {
        missingTarget = missingTarget || true;
      }
    }

    return {
      missingTarget,
      pageFlagTarget,
      portalTarget,
      modalTarget,
    };
  }

  // HACK: Ensure we render twice so that getTargets can get the rendered DOM elements
  componentWillReceiveProps() {
    this.setState({ rendered: false });
  }
  componentDidMount() {
    this.componentDidUpdate();
  }
  componentDidUpdate() {
    if (!this.state.rendered) {
      this.setState({ rendered: true });
    }
  }

  render() {
    let step = this.props.steps[this.state.step];

    if (!step) {
      return null;
    }

    const {
      missingTarget,
      pageFlagTarget,
      portalTarget,
      modalTarget,
    } = this.getTargets(step);

    if (missingTarget && this.state.stepTimeout === null) {
      return (
        <Modal className="Modal TutorialModal">
          <TutorialModal onBack={this.backModal} onClose={this.close}>
            <div className="text-centered">
              <h2>{t`Whoops!`}</h2>
              <p className="my2">{t`Sorry, it looks like something went wrong. Please try restarting the tutorial in a minute.`}</p>
              <button
                className="Button Button--primary"
                onClick={this.close}
              >{t`Okay`}</button>
            </div>
          </TutorialModal>
        </Modal>
      );
    }

    let modal;
    if (step.getModal) {
      let modalSteps = this.props.steps.filter(s => !!s.getModal);
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
            onClose: this.close,
          })}
        </TutorialModal>
      );
    }

    let pageFlagText;
    if (step.getPageFlagText) {
      pageFlagText = step.getPageFlagText();
    }

    // only pass onClose to modal/popover if we're on the last step
    let onClose;
    if (this.state.step === this.props.steps.length - 1) {
      onClose = this.close;
    }

    return (
      <div>
        <PageFlag
          ref="pageflag"
          className="z5"
          target={pageFlagTarget}
          text={pageFlagText}
          bounce={this.state.bouncePageFlag}
        />
        {portalTarget && <Portal className="z2" target={portalTarget} />}
        <Modal
          isOpen={!!(modal && !step.getModalTarget)}
          style={{ backgroundColor: "transparent" }}
          className="Modal TutorialModal"
          onClose={onClose}
        >
          {modal}
        </Modal>
        <Popover
          isOpen={!!(modal && step.getModalTarget && modalTarget)}
          target={step.getModalTarget}
          targetOffsetY={25}
          onClose={onClose}
          className="TutorialModal"
        >
          {modal}
        </Popover>
      </div>
    );
  }
}
