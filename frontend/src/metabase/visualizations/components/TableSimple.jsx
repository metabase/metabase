/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import Alert from "metabase/components/Alert.jsx";
import styles from "./Table.css";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import Icon from "metabase/components/Icon.jsx";
import MiniBar from "./MiniBar";

import { formatValue } from "metabase/lib/formatting";
import {
  getTableCellClickedObject,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";

import { t } from "c-3po";
import cx from "classnames";
import _ from "underscore";

import { isID, isFK } from "metabase/lib/schema_metadata";

import ModalContent from "metabase/components/ModalContent.jsx";

import Modal from "metabase/components/Modal.jsx";

import { getEngineNativeType, formatJsonQuery } from "metabase/lib/engine";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

type Props = VisualizationProps & {
  height: number,
  className?: string,
  isPivoted: boolean,
  myData:Array,
};

type State = {
  page: number,
  pageSize: number,
  sortColumn: ?number,
  sortDescending: boolean,
  isOpen:boolean,
  alertMessage:string,
  
};

@ExplicitSize()
export default class TableSimple extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);

    this.state = {
      page: 0,
      pageSize: 1,
      sortColumn: null,
      sortDescending: false,
      isOpen:false,
    };
  }

  static propTypes = {
    data: PropTypes.object.isRequired,
  };

  static defaultProps = {
    className: "",
    myData:[]
    
  };

  setSort(colIndex: number) {
    if (this.state.sortColumn === colIndex) {
      this.setState({ sortDescending: !this.state.sortDescending });
    } else {
      this.setState({ sortColumn: colIndex });
    }
  }
  
  handleClose() {
    this.setState({ isOpen: false })
  }
  handleClick(a){
  
    this.props.myData=a;
    console.log("Bütün data  :"+JSON.stringify(this.props.myData))
    console.log("Birinci data:   "+JSON.stringify(this.props.myData[0]));
    
    console.log(this.props);
    if(this.props.myData[0]!=null||this.props.myData[0]!=undefined){
    this.setState({ isOpen: true })
  }
    
  }
  componentDidUpdate() {
    let headerHeight = ReactDOM.findDOMNode(
      this.refs.header,
    ).getBoundingClientRect().height;
    let footerHeight = this.refs.footer
      ? ReactDOM.findDOMNode(this.refs.footer).getBoundingClientRect().height
      : 0;
    let rowHeight =
      ReactDOM.findDOMNode(this.refs.firstRow).getBoundingClientRect().height +
      1;
    let pageSize = Math.max(
      1,
      Math.floor((this.props.height - headerHeight - footerHeight) / rowHeight),
    );
    if (this.state.pageSize !== pageSize) {
      this.setState({ pageSize });
    }
  }

  render() {
    const {
      data,
      onVisualizationClick,
      visualizationIsClickable,
      isPivoted,
      settings,
      getColumnTitle,
    } = this.props;
    const { rows, cols } = data;
    const getCellBackgroundColor = settings["table._cell_background_getter"];
    
    const { page, pageSize, sortColumn, sortDescending } = this.state;

    let start = pageSize * page;
    let end = Math.min(rows.length - 1, pageSize * (page + 1) - 1);

    let rowIndexes = _.range(0, rows.length);
    if (sortColumn != null) {
      rowIndexes = _.sortBy(rowIndexes, rowIndex => rows[rowIndex][sortColumn]);
      if (sortDescending) {
        rowIndexes.reverse();
      }
    }
   

    return (
      <div className={cx(this.props.className, "relative flex flex-column")}>
        <div className="flex-full relative">
          <div
            className="absolute top bottom left right scroll-x scroll-show scroll-show--hover"
            style={{ overflowY: "hidden" }}
          >
            <table
              className={cx(
                styles.Table,
                styles.TableSimple,
                "fullscreen-normal-text",
                "fullscreen-night-text",
              )}
            >
              <thead ref="header">
                <tr>
                  {cols.map((col, colIndex) => (
                    <th
                      key={colIndex}
                      className={cx(
                        "TableInteractive-headerCellData cellData text-brand-hover text-medium",
                        {
                          "TableInteractive-headerCellData--sorted":
                            sortColumn === colIndex,
                          "text-right": isColumnRightAligned(col),
                        },
                      )}
                      onClick={() => this.setSort(colIndex)}
                    >
                      <div className="relative">
                        <Icon
                          name={sortDescending ? "chevrondown" : "chevronup"}
                          width={8}
                          height={8}
                          style={{
                            position: "absolute",
                            right: "100%",
                            marginRight: 3,
                          }}
                        />
                        <Ellipsified>{getColumnTitle(colIndex)}</Ellipsified>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowIndexes.slice(start, end + 1).map((rowIndex, index) => (
                  <tr style={{cursor:'grab'}} key={rowIndex} ref={index === 0 ? "firstRow" : null} onClick={()=>this.handleClick(data.rows[rowIndex])}>
                  {rows[rowIndex].map((value, columnIndex) => {
                      const column = cols[columnIndex];
                      const clicked = getTableCellClickedObject(
                        data,
                        rowIndex,
                        columnIndex,
                        isPivoted,
                      );
                      const isClickable =
                        onVisualizationClick &&
                        visualizationIsClickable(clicked);
                      const columnSettings = settings.column(column);
                      return (
                        <td
                          key={columnIndex}
                          style={{
                            whiteSpace: "nowrap",
                            backgroundColor:
                              getCellBackgroundColor &&
                              getCellBackgroundColor(
                                value,
                                rowIndex,
                                column.name,
                              ),
                          }}
                          className={cx(
                            "px1 border-bottom text-dark fullscreen-normal-text fullscreen-night-text text-bold",
                            {
                              "text-right": isColumnRightAligned(column),
                              "Table-ID": isID(column),
                              "Table-FK": isFK(column),
                              link: isClickable && isID(column),
                            },
                          )}
                        >
                          <span
                            className={cx("cellData inline-block", {
                              "cursor-pointer text-brand-hover": isClickable,
                            })}
                            onClick={
                              isClickable
                                ? e => {
                                    onVisualizationClick({
                                      ...clicked,
                                      element: e.currentTarget,
                                    });
                                  }
                                : undefined
                            }
                          >
                            {value == null ? (
                              "-"
                            ) : columnSettings["show_mini_bar"] ? (
                              <MiniBar
                                value={value}
                                options={columnSettings}
                                extent={getColumnExtent(
                                  cols,
                                  rows,
                                  columnIndex,
                                )}
                              />
                            ) : (
                              formatValue(value, {
                                ...columnSettings,
                                type: "cell",
                                jsx: true,
                                rich: true,
                              })
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {pageSize < rows.length ? (
          <div
            ref="footer"
            className="p1 flex flex-no-shrink flex-align-right fullscreen-normal-text fullscreen-night-text"
          >
            <span className="text-bold">{t`Rows ${start + 1}-${end + 1} of ${
              rows.length
            }`}</span>
            <span
              className={cx("text-brand-hover px1 cursor-pointer", {
                disabled: start === 0,
              })}
              onClick={() => this.setState({ page: page - 1 })}
            >
              <Icon name="left" size={10} />
            </span>
            <span
              className={cx("text-brand-hover pr1 cursor-pointer", {
                disabled: end + 1 >= rows.length,
              })}
              onClick={() => this.setState({ page: page + 1 })}
            >
              <Icon name="right" size={10} />
            </span>
          </div>
        ) : null}
       

              <Modal
              medium
              isOpen={this.state.isOpen}
              onClose={() => this.setState({ isOpen: false })}
            >
                 <div id="custommodel" className="modal fade show" style={{display: 'block', overflowY: 'auto'}}>
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="p1" style={{backgroundColor: '#509ee4'}}>
              <h5 className="text-uppercase modal-title" style={{color: 'white',fontSize:'20px' }}>{this.props.myData[0]}</h5>
            </div>
            <div className="modal-body">
              <div>
                <form className="Grid">
                  <div className="pl1 pt1"><img className="img-fluid" src={this.props.myData[5]} id="profileImage" style={{width: '180px'}} /></div>
                  <div className="pl4 pt2" style={{paddingLeft:'3rem'}} >
                    <h6 className="text-nowrap text-right PopoverBody h4" id="MyHeader">Kimlik No :</h6>
                    <h6 className="text-nowrap text-right PopoverBody h4" id="MyHeader">Firma :</h6>
                    <h6 className="text-nowrap text-right PopoverBody h4" id="MyHeader">Kamera No :</h6>
                    <h6 className="text-nowrap text-right PopoverBody h4" id="MyHeader">Tarih :</h6>
                  </div>
                  <div className="pl4 pt2">
                    <h6 className="text-nowrap text-left PopoverBody h4">{this.props.myData[1]}</h6>
                    <h6 className="text-nowrap text-left PopoverBody h4">{this.props.myData[2]}</h6>
                    <h6 className="text-nowrap text-left PopoverBody h4">{this.props.myData[3]}</h6>
                    <h6 className="text-nowrap text-left PopoverBody h4">{this.props.myData[4]}</h6>
                  </div>
                </form>
                <hr />
                <div className="pb1 justify-center" style={{display:"flex"}}><img src={this.props.myData[6]} style={{display:"inline-block",width:'65%'}} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
            </Modal>                      
      </div>
       
    );
  }
}