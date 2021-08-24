/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Button from "metabase/components/Button";
import Input from "metabase/components/Input";
import Card from "metabase/components/Card";
import { SketchPicker } from "react-color";
import Select, { Option } from "metabase/components/Select";
import { normal } from "metabase/lib/colors";

const DEFAULT_COLOR_SQUARE_SIZE = 32;

const ColorSquare = ({ color, size }) => (
  <div
    style={{
      width: size,
      height: size,
      backgroundColor: color,
      borderRadius: size / 8,
    }}
  />
);

class RegionMapConditions extends Component {
  constructor(props) {
    super(props);
    const {value} = props;
    const rules = [];
    const mode = value && value.mode ? value.mode:  'CUSTOM';
    if(value && value.rules){
      value.rules.forEach((r)=>{
        let found = false;
        if(isNaN(r.start) && mode === 'CUSTOM'){
        found = true;
        }
        if(isNaN(r.end) && mode === 'CUSTOM'){
          found = true;
        }
        if(parseFloat(r.start) > parseFloat(r.end)){
          found = true;
        }
        if(!(/^#[0-9A-F]{6}$/i.test(r.color))){
          found = true;
        }
        
        if(!found){
          rules.push(r);
        }
      })
    }
    rules.push({});
    this.state = {
      rules,
      mode, // RANGE, COLOR, CUSTOM
    }
  }
  

  static propTypes = {
    onChange: PropTypes.func.isRequired,
    size: PropTypes.number,
    triggerSize: PropTypes.number,
    value: PropTypes.string,
  };

  addCondition = ()=>{
    const {rules, mode} = this.state;
    const last = rules[rules.length-1];
  
    if(isNaN(last.start) && mode === 'CUSTOM'){
      alert('Invalid start');
      return
    }
    if(isNaN(last.end) && mode === 'CUSTOM'){
      alert('Invalid end');
      return
    }
    if(parseFloat(last.start) > parseFloat(last.end)){
      alert('Start should be less than the end');
      return
    }
    if(!(/^#[0-9A-F]{6}$/i.test(last.color))){
      alert('Invalid Color');
      return
    }
  
    this.setState({rules:[...rules, {start: last.end}]}, ()=>{
      this.props.onChange({rules: this.state.rules, mode: this.state.mode});
    });
  }
  removeCondition=(index)=>{
    const {rules} = this.state;
    rules.splice(index, 1);
    this.setState({rules}, ()=>{
      this.props.onChange({rules: this.state.rules});
    });
  }
  render() {
    const { onChange , value} = this.props;
    console.log(value,'=-');
    const {rules} = this.state
    return (
      <div className="region-condition-map-container">
        <Select value={this.state.mode} onChange={(e)=>{
          this.setState({mode: e.target.value, rules: [{}]});
          this.props.onChange({mode: e.target.value, rules: [{}]});
        }}>
            {
              ['CUSTOM', 'RANGE', 'COLOR'].map((c)=>{
                return <Option key={c} value={c}>{c}</Option>
              })
            }
          </Select>
          <div style={{padding: '5px'}}></div>
        {
          rules.map((rule, index)=>{
            return<div  key={index}>
             <div>
              {
                this.state.mode === 'CUSTOM' && <div style={{display: 'flex',flexDirection: 'column', 'paddingBottom' : '5px'}}>
                <div style={{flexGrow: 1}}>
                  <Input
                    value={rule.start}
                    width={'100%'}
                    disabled={index > 0}
                    type={'number'}
                    onChange={(e)=>{
                      rules[index].start = e.target.value;
                      this.setState({rules: JSON.parse(JSON.stringify(rules))}, ()=>{
                      })
                    }}
                    placeholder={'Start Inclusive'}
                  />
                </div>
                <div style={{padding: '5px'}}>-</div>
                <div style={{flexGrow: 1}}>
                  <Input
                    value={rule.end}
                    width={'100%'}
                    
                    onChange={(e)=>{
                      rules[index].end = e.target.value;
                        this.setState({rules: JSON.parse(JSON.stringify(rules))}, ()=>{
                        })
                      }}
                    type={'number'}
                    placeholder={'End ' + (index === rules.length-1? 'Includes' : 'Excludes')}
                  />
                  </div>
                </div> 
              }
              
        
                <Input
                  value={rule.color}
                  width={'100%'}
                  type={'text'}
                  onChange={(e)=>{
                    rules[index].color = e.target.value;
                    this.setState({rules: JSON.parse(JSON.stringify(rules))}, ()=>{
                    })
                    }}
                  placeholder={'Color in HEX (#000000)'}
                />
                
                   <div style={{padding: '5px'}}></div>
                   {
                     (index === (rules.length -1)) ?  <div>
                       <Button
                     mr={1}
                     onClick={this.addCondition}
                   >
                     Add Condition
                   </Button>
                   <hr/>
                       </div> :  <Button
                    mr={1}
                    variant='danger'
                    onClick={()=>this.removeCondition(index)}
                  >
                  Remove Condition
                </Button>
                   }
               <div style={{padding: '10px'}}></div>
            </div>
             </div>
          })
        }
        
  
      </div>
    );
  }
}
// class RegionMapConditionRow extends Component {
//   constructor(props) {
//     super(props);

//     this.colorPopover = React.createRef();
//   }
//   static defaultProps = {
//     size: DEFAULT_COLOR_SQUARE_SIZE,
//     triggerSize: DEFAULT_COLOR_SQUARE_SIZE,
//     padding: 4,
//   };

//   static propTypes = {
//     colors: PropTypes.array,
//     onChange: PropTypes.func.isRequired,
//     size: PropTypes.number,
//     triggerSize: PropTypes.number,
//     value: PropTypes.string,
//   };

//   render() {
//     const { onChange, padding, size, triggerSize, value, fancy } = this.props;
//     const colors = this.props.colors || Object.values(normal).slice(0, 9);
//     return (
//       <div className="inline-block">
//         <PopoverWithTrigger
//           ref={this.colorPopover}
//           triggerElement={
//             <div
//               className="bordered rounded flex align-center"
//               style={{ padding: triggerSize / 4 }}
//             >
//               <ColorSquare color={value} size={triggerSize} />
//             </div>
//           }
//         >
//           {fancy ? (
//             <div>
//               {/* HACK to hide SketchPicker's border/shadow */}
//               <div className="rounded overflow-hidden">
//                 <SketchPicker
//                   color={value}
//                   onChangeComplete={color => {
//                     onChange(color.hex);
//                   }}
//                 />
//               </div>
//               <div className="p1 border-top">
//                 <Button onClick={() => this.colorPopover.current.close()}>
//                   Done
//                 </Button>
//               </div>
//             </div>
//           ) : (
//             <div className="p1">
//               <ol
//                 className="flex flex-wrap"
//                 style={{
//                   maxWidth: 120,
//                 }}
//               >
//                 {colors.map((color, index) => (
//                   <li
//                     className="cursor-pointer"
//                     style={{ padding }}
//                     key={index}
//                     onClick={() => {
//                       onChange(color);
//                       this.colorPopover.current.close();
//                     }}
//                   >
//                     <ColorSquare color={color} size={size} />
//                   </li>
//                 ))}
//               </ol>
//             </div>
//           )}
//         </PopoverWithTrigger>
//       </div>
//     );
//   }
// }

export default RegionMapConditions;
