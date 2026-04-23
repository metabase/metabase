# Metric IDs
TOTAL_ORDERS_METRIC_ID = 83
AOV_METRIC_ID = 84
INVENTORY_LEVEL_METRIC_ID = 89
TOTAL_EMPLOYEES_METRIC_ID = 90
TOTAL_REVENUE_METRIC_ID = 92
BIKE_REVENUE_METRIC_ID = 95
TOTAL_SALES_TEAM_REVENUE_METRIC_ID = 108

# Model IDs
SALES_FACT_MODEL_ID = 76
CUSTOMER_ANALYTICS_MODEL_ID = 77
PRODUCT_PERFORMANCE_MODEL_ID = 78
INVENTORY_STATUS_MODEL_ID = 79
PURCHASE_ORDER_ANALYSIS_MODEL_ID = 80
SALES_TEAM_PERFORMANCE_MODEL_ID = 81

# Table IDs
EMPLOYEE_TABLE_NAME = "adventureworks2014.employee"
EMPLOYEE_PAY_HISTORY_TABLE_NAME = "adventureworks2014.employeepayhistory"
SHIFT_TABLE_NAME = "adventureworks2014.shift"
TRANSACTION_HISTORY_ARCHIVE_TABLE_NAME = "adventureworks2014.transactionhistoryarchive"
SALESPERSON_TABLE_NAME = "adventureworks2014.salesperson"
PRODUCT_TABLE_NAME = "adventureworks2014.product"
ADDRESS_TABLE_NAME = "adventureworks2014.address"
PRODUCT_INVENTORY_TABLE_NAME = "adventureworks2014.productinventory"
DATABASE_LOG_TABLE_NAME = "adventureworks2014.databaselog"
PURCHASE_ORDER_DETAIL_TABLE_NAME = "adventureworks2014.purchaseorderdetail"
SALES_ORDER_DETAIL_TABLE_NAME = "adventureworks2014.salesorderdetail"
SALES_ORDER_HEADER_TABLE_NAME = "adventureworks2014.salesorderheader"
VENDOR_TABLE_NAME = "adventureworks2014.vendor"

# Field IDs for Table: employee
EMPLOYEE_BUSINESSENTITYID = 184
EMPLOYEE_GENDER = 648
EMPLOYEE_MARITALSTATUS = 341
EMPLOYEE_SALARIEDFLAG = 379
EMPLOYEE_ORGANIZATIONLEVEL = 562
EMPLOYEE_VACATIONHOURS = 265
EMPLOYEE_SICKLEAVEHOURS = 325
EMPLOYEE_CURRENTFLAG = 394
EMPLOYEE_HIREDATE = 629

# Field IDs for Table: employeepayhistory
EMPLOYEEPAYHISTORY_BUSINESSENTITYID = 340
EMPLOYEEPAYHISTORY_RATE = 320
EMPLOYEEPAYHISTORY_PAYFREQUENCY = 209
EMPLOYEEPAYHISTORY_RATECHANGEDATE = 171

# Field IDs for Table: shift
SHIFT_SHIFTID = 440
SHIFT_NAME = 522

# Field IDs for Table: address
ADDRESS_CITY = 257
ADDRESS_POSTALCODE = 177
ADDRESS_ADDRESSLINE1 = 640
ADDRESS_ADDRESSID = 362
ADDRESS_STATEPROVINCEID = 286

# Field IDs for Table: transactionhistoryarchive
TRANSACTIONHISTORYARCHIVE_TRANSACTIONTYPE = 610
TRANSACTIONHISTORYARCHIVE_TRANSACTIONDATE = 569
TRANSACTIONHISTORYARCHIVE_QUANTITY = 259
TRANSACTIONHISTORYARCHIVE_PRODUCTID = 524
TRANSACTIONHISTORYARCHIVE_ACTUALCOST = 194

# Field IDs for Table: databaselog
DATABASELOG_EVENT = 327
DATABASELOG_SCHEMA = 180
DATABASELOG_OBJECT = 584
DATABASELOG_POSTTIME = 358

# Field IDs for Table: purchaseorderdetail
PURCHASEORDERDETAIL_ORDERQTY = 432
PURCHASEORDERDETAIL_UNITPRICE = 378
PURCHASEORDERDETAIL_PURCHASEORDERID = 342
PURCHASEORDERDETAIL_PRODUCTID = 361

# Field IDs for Table: product
PRODUCT_LISTPRICE = 650

# Field IDs for Table: salesperson
SALESPERSON_SALESQUOTA = 556

USER_IS_VIEWING_AOV_METRIC = [
    {
        "id": AOV_METRIC_ID,
        "type": "metric",
        "query": {
            "database": 1,
            "type": "query",
            "query": {"aggregation": [["metric", AOV_METRIC_ID]], "source-table": "card__76"},
        },
        "chart_configs": [
            {
                "title": "Average Order Value",
                "description": "Average totaldue per sales order. Useful for understanding typical order size. Can be broken down by time period or customer segment.",
                "series": {},
                "timeline_events": [],
                "query": {
                    "database": 1,
                    "type": "query",
                    "query": {"aggregation": [["metric", AOV_METRIC_ID]], "source-table": "card__76"},
                },
                "display_type": "scalar",
            }
        ],
    }
]
