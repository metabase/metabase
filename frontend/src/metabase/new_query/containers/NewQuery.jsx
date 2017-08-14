import React, { Component } from "react";
import cx from "classnames";

class NewQueryOption extends Component {
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
       const { width, image, title, description, onClick } = this.props;
       const { hover } = this.state;

       return (
           <div
               className="bg-white p1 align-center bordered rounded cursor-pointer transition-all text-centered text-brand-light"
               style={{
                   boxShadow: hover ? "0 3px 8px 0 rgba(220,220,220,0.50)" : "0 1px 3px 0 rgba(220,220,220,0.50)",
                   height: "310px"
               }}
               onMouseOver={() => this.setState({hover: true})}
               onMouseLeave={() => this.setState({hover: false})}
               onClick={onClick}
           >
               <div className="flex align-center layout-centered" style={{ height: "160px" }}>
                   <img
                       src={`${image}.png`}
                       style={{ width: width ? `${width}px` : "210px" }}
                       srcSet={`${image}@2x.png 2x`}
                   />

               </div>
               <div className="text-grey-2 text-normal mt2 mb2 text-paragraph" style={{lineHeight: "1.5em"}}>
                   <h2 className={cx("transition-all", {"text-grey-5": !hover}, {"text-brand": hover})}>{title}</h2>
                   <p className={"text-grey-4"}>{description}</p>
               </div>
           </div>
       );
   }
}

export default class NewQuery extends Component {
    props: {
        onClose: () => void
    };

    state = {
        addingSavedMetric: false
    }

    render() {
        return (
            <div className="flex-full full ml-auto mr-auto pl1 pr1 mt2 mb2 align-center"
                 style={{maxWidth: "800px"}}>
                <ol className="flex-full Grid Grid--guttersXl Grid--full small-Grid--1of2">
                    <li className="Grid-cell">
                        {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                        <NewQueryOption
                            image="/app/img/questions_illustration"
                            title="Metrics"
                            description="See data over time, as a map, or pivoted to help you understand trends or changes."
                            onClick={() => this.setState({addingSavedMetric: true})}
                        />
                    </li>
                    <li className="Grid-cell">
                        <NewQueryOption
                            image="/app/img/list_illustration"
                            title="Segments"
                            description="Explore tables and see what’s going on underneath your charts."
                            width={180}
                            onClick={() => alert("Not implemented yet.")}
                        />
                    </li>
                    <li className="Grid-cell">
                        {/*TODO: Move illustrations to the new location in file hierarchy. At the same time put an end to the equal-size-@2x ridicule. */}
                        <NewQueryOption
                            image="/app/img/custom_question"
                            title="Custom"
                            description="Use the simple query builder to create your own new custom question."
                            onClick={() => this.setState({addingSavedMetric: true})}
                        />
                    </li>
                    <li className="Grid-cell">
                        <NewQueryOption
                            image="/app/img/sql_illustration"
                            title="SQL"
                            description="Use SQL or other native languages for data prep or manipulation."
                            onClick={() => alert("Not implemented yet.")}
                        />
                    </li>
                </ol>
            </div>
        );
    }
}
