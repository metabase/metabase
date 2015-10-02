'use strict';

import ModalContent from "metabase/components/ModalContent.react";

export default React.createClass({
    displayName: "QuestionSavedModal",
    propTypes: {
        addToDashboardFn: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func.isRequired
    },

    render: function() {
        return (
            <ModalContent
                title="Saved! What now?"
                closeFn={this.props.closeFn}
            >
                <div className="Form-inputs mb4">
                    <ul>
                        <li>
                            <a className="no-decoration flex align-center border-bottom py1 pb2" href="/">
                                <img className="" style={{height: "32px"}} src="/app/components/icons/assets/illustration_home.png" />
                                <span className="h3 ml2 text-bold text-brand-hover">Go home</span>
                            </a> </li>
                        <li>
                            <a className="no-decoration flex align-center border-bottom py1 pb2" href="#" onClick={this.props.addToDashboardFn}>
                                <img className="" style={{height: "32px"}} src="/app/components/icons/assets/illustration_dashboard.png" />
                                <span className="h3 ml2 text-bold text-brand-hover">Add to a dashboard</span>
                            </a> </li>
                        <li>
                            <a className="no-decoration flex align-center pt1" href="/q">
                                <img className="" style={{height: "32px"}} src="/app/components/icons/assets/illustration_question.png" />
                                <span className="h3 ml2 text-bold text-brand-hover">Just keep asking questions</span>
                            </a>
                        </li>
                    </ul>
                </div>
            </ModalContent>
        );
    }
});
