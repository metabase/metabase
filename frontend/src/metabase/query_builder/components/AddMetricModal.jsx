import React, { Component } from "react";
import cx from "classnames";

import type {TableMetadata} from "metabase/meta/types/Metadata";
import ModalContent from "metabase/components/ModalContent";
import EmptyState from "metabase/components/EmptyState";
import SavedMetricSelector from "metabase/query_builder/components/SavedMetricSelector";

class AddMetricButton extends Component {
   props: {
       image: string,
       title: string,
       description: string,
       onClick: () => void
   };

   state = {
       hover: false
   };

   render() {
       const { image, title, description, onClick } = this.props;
       const { hover } = this.state;

       return (
           <div className="bg-white p2 flex align-center rounded cursor-pointer transition-all"
                style={{
                    border: "1px solid rgba(220,225,228,0.50)",
                    boxShadow: hover ? "0 3px 8px 0 rgba(220,220,220,0.50)" : "0 1px 3px 0 rgba(220,220,220,0.50)",
                    height: "500px",
                    userSelect: "none"
                }}
                onMouseOver={() => this.setState({hover: true})}
                onMouseLeave={() => this.setState({hover: false})}
                onClick={onClick}
           >
               <EmptyState
                   message={
                       <div className="mt4">
                           <h2 className={cx("transition-all", {"text-grey-5": !hover}, {"text-brand": hover})}>{title}</h2>
                           <p className={"text-grey-4"}>{description}</p>
                       </div>
                   }
                   image={image}
                   smallDescription
               />
           </div>
       );
   }
}

export default class AddMetricModal extends Component {
    props: {
        tableMetadata: TableMetadata,
        onClose: () => void
    };

    state = {
        addingSavedMetric: false
    };

    render() {
        const { onClose } = this.props;
        const { addingSavedMetric } = this.state;

        const MetricTypeSelector = () =>
            <div className="flex-full full ml-auto mr-auto pl1 pr1 mt2 mb2 flex align-center"
                 style={{maxWidth: "1000px"}}>
                <ol className="flex-full Grid Grid--guttersXXl Grid--full small-Grid--1of2">
                    <li className="Grid-cell">
                        {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                        <AddMetricButton
                            image="/app/img/questions_illustration"
                            title="Add a metric"
                            description="We’ll show you saved metrics that are compatible with the metric you’re currently looking at."
                            onClick={() => this.setState({addingSavedMetric: true})}
                        />
                    </li>
                    <li className="Grid-cell">
                        <AddMetricButton
                            image="/app/img/new_metric"
                            title="Create a new metric"
                            description="Couldn’t find the thing you were looking for? If you want something done right, do it yourself, that’s your motto."
                            onClick={() => alert("Not implemented yet.")}
                        />
                    </li>
                </ol>
            </div>;

        return (
            <ModalContent
                fullPageModal={true}
                onClose={onClose}
                className="bg-grey-0"
            >
                { addingSavedMetric ? <SavedMetricSelector onClose={onClose} {...this.props} /> : <MetricTypeSelector />}
            </ModalContent>
        )
    }
}
