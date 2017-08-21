import React, { Component } from "react";
import cx from "classnames";

export default class NewQueryOption extends Component {
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
               className="bg-white p3 align-center bordered rounded cursor-pointer transition-all text-centered"
               style={{
                   boxShadow: hover ? "0 3px 8px 0 rgba(220,220,220,0.50)" : "0 1px 3px 0 rgba(220,220,220,0.50)",
                   height: 340
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
               <div className="text-normal mt2 mb2 text-paragraph" style={{lineHeight: "1.5em"}}>
                   <h2 className={cx("transition-all", {"text-brand": hover})}>{title}</h2>
                   <p className={"text-grey-4"}>{description}</p>
               </div>
           </div>
       );
   }
}
