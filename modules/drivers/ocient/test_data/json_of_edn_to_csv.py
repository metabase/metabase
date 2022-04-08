import json
import csv
import os

from os import listdir
from os.path import isfile, join

global SOURCE_DIR
SOURCE_DIR = "./converted"

global OUTPUT_BASE_DIR
OUTPUT_BASE_DIR = './output'

global CONSOLIDATED_FILENAME
CONSOLIDATED_FILENAME = f'{OUTPUT_BASE_DIR}/ddl/consolidated_ddl.sql'

global HOST
HOST = "10.10.110.4"

write_data_files = True
write_ddl = True
write_consolidated_ddl = False
write_pipeline_files = True # don't overwrite since they work and we had to manually edit timestamps
write_consolidated_pipeline = False

global TYPE_MAPPING
TYPE_MAPPING = {
	"DateTimeWithZoneOffset" : "TIMESTAMP",
	"DateTimeWithTZ" : "TIMESTAMP",
	"DateTimeWithLocalTZ" : "TIMESTAMP",
	"DateTimeWithZoneID" : "TIMESTAMP",
	"DateTime" : "TIMESTAMP",
	"Time" : "TIME",
	"TimeWithLocalTZ" : "TIME",
	"TimeWithZoneOffset" : "TIME",
	"Text" : "VARCHAR(255)",
	"Integer" : "INT",
	"Float" : "DOUBLE",
	"Date" : "DATE",
	"*" : "VARCHAR(255)",
	"Boolean" : "BOOLEAN",
	"BigInteger" : "TIMESTAMP" # hack for toucan incidents and tupac sighting coercion strategy
}

def get_database_name(converted_filename):
	head, tail = os.path.split(file.name)
	names = tail.split('.')
	filename = names[0]
	return filename

def base_type_map(base):
	return TYPE_MAPPING[base] or base

def make_dirs(path):
	if not os.path.exists(path):
		os.makedirs(path)

def write_table_ddl(database, table, fields, file):
	file.write(f'/* database: {database} */\n')
	file.write(f'CREATE DATABASE IF NOT EXISTS "{database}";\n\n')
	file.write(f'connect to jdbc:ocient://{HOST}:4050/{database};\n\n')
	file.write(f'DROP TABLE IF EXISTS "public"."{table}";\n')
	file.write(f'CREATE TABLE "public"."{table}"(\n')
	# some of these time keys can be replaced by the created_at column
	file.write("  created TIMESTAMP TIME KEY BUCKET(1, HOUR) NOT NULL DEFAULT '0',\n")
	file.write("  id INT NOT NULL,\n")
	for field in fields:
		file.write(f'  "{field["field-name"]}" {base_type_map(field["base-type"])},\n')

	file.write("  CLUSTERING INDEX idx01 (id)\n")
	file.write(");\n\n")

def write_ddl_consolidated(database, table, fields):
	with open(CONSOLIDATED_FILENAME, "a") as file:
		write_table_ddl(database, table, fields, file)

def write_ddl(database, table, fields):
	make_dirs(f'{OUTPUT_BASE_DIR}/ddl')
	with open(f'{OUTPUT_BASE_DIR}/ddl/{database}_{table}.sql', "w+") as file:
		write_table_ddl(database, table, fields, file)

def write_to_csv(database, table, fields, rows):
	make_dirs(f'{OUTPUT_BASE_DIR}/csv')
	i = 1
	with open(f'{OUTPUT_BASE_DIR}/csv/{database}_{table}.csv', "w+") as file:
		csv_file = csv.writer(file)
		cols = [z["field-name"] for z in fields]
		cols.insert(0, "id")
		csv_file.writerow(cols)
		for row in rows:
			row_vals = ["null" if x is None else x for x in row]
			row_vals.insert(0,i)

			csv_file.writerow(row_vals)
			i += 1

def write_as_jsonl(database, table, fields, rows):
	make_dirs(f'{OUTPUT_BASE_DIR}/jsonl')
	i = 1
	with open(f'{OUTPUT_BASE_DIR}/jsonl/{database}_{table}.jsonl', "w+") as file:
		for row in rows:
			row_data = { "id" : i }
			for n in range(len(fields)):
				row_data[fields[n]['field-name']] = row[n]
			file.write(json.dumps(row_data))
			file.write('\n')
			i += 1


def write_pipeline(database, table, fields, source, file_suffix):
	make_dirs(f'{OUTPUT_BASE_DIR}/pipelines')
	file_group = list(source["file_groups"].keys())[0]
	escaped_table = f'{database}.public.{table}'
	pipeline_json = {
		"version": 2,
		"pipeline_id": f'pipeline-{table}',
		"source": source,
		"sink": {
		    "type": "ocient",
		    "remotes": ["127.0.0.1:5050"]
		},
		"transform": {
		    "topics": {
		        file_group : {
		            "tables": {
		                escaped_table : {
		                    "columns": {
		                    }
		                }
		            }
		        }
		    }
		}
	}
	pipeline_json['transform']['topics'][file_group]["tables"][escaped_table]["columns"]['id'] = 'id'
	for field in fields:
		pipeline_json['transform']['topics'][file_group]["tables"][escaped_table]["columns"][field["field-name"]] = f'"{field["field-name"]}"'

	with open(f'{OUTPUT_BASE_DIR}/pipelines/{database}_{table}{file_suffix}.json', "w+") as file:
		file.write(json.dumps(pipeline_json, indent=4))
	return pipeline_json

def write_pipeline_cos(database, table, fields):
	file_group = f'{database}_{table}'
	source = {
        "type": "s3",
        "endpoint": "http://cos/",
        "bucket": "misc",
        "file_groups": {
            file_group: {
                "type": "lexicographic",
                "prefix": f'jkelley/metabase/jsonl/{file_group}.jsonl'
            }
        },
        "partitions": 2,
        "partitions_assigned": [
            0,
            1
        ]
    }
	return write_pipeline(database, table, fields, source, "_cos")

def write_pipeline_localfile(database, table, fields):
	file_group = f'{database}_{table}'
	source = {
		"type": "local",
		"file_groups": {
			file_group : {
				"type": "lexicographic",
				"path": f'/home/jkelley/test_data/jsonl/{file_group}.jsonl'
			}
		},
		"partitions" : 8,
		"partitions_assigned" : [0,7]
	}
	return write_pipeline(database, table, fields, source, "")

def write_master_pipeline(file_groups, topics, suffix = ""):
	make_dirs(f'{OUTPUT_BASE_DIR}/pipelines')
	pipeline_json = {
		"version": 2,
		"pipeline_id": 'pipeline-metabase',
		"source": {
			"type": "s3",
			"endpoint": "http://cos/",
			"bucket": "misc",
			"file_groups": file_groups,
			"partitions": 2,
			"partitions_assigned": [
		    	0,
			   	1
			]
		},
		"sink": {
			"type": "ocient",
			"remotes": ["127.0.0.1:5050"]
		},
		"transform": {
			"topics": topics
		}
	}
	if suffix != '_cos':
		pipeline_json["source"] = {
			"type": "local",
			"file_groups": file_groups,
			"partitions" : 8,
			"partitions_assigned" : [0,7]
		}


	with open(f'{OUTPUT_BASE_DIR}/pipelines/master_pipeline{suffix}.json', "w+") as file:
		file.write(json.dumps(pipeline_json, indent=4))

def first_key(my_dict):
	return list(my_dict.keys())[0]

master_file_groups = {}
master_topics = {}

master_file_groups_cos = {}
master_topics_cos = {}


files_list = [f for f in listdir(SOURCE_DIR) if isfile(join(SOURCE_DIR, f))]
for f in files_list:
	with open(f'{SOURCE_DIR}/{f}') as file:
		database_name = get_database_name(file)
		data = json.load(file)
		for triplet in data:
			table = triplet[0]
			fields = triplet[1]
			rows = triplet[2]
			if write_data_files:
				write_to_csv(database_name, table, fields, rows)
				write_as_jsonl(database_name, table, fields, rows)
			if write_ddl:
				write_ddl(database_name, table, fields)
			if write_consolidated_ddl:
				write_ddl_consolidated(database_name, table, fields)


			if write_pipeline_files:
				pipeline_json_localfile = write_pipeline_localfile(database_name, table, fields)
				pipeline_json_cos = write_pipeline_cos(database_name, table, fields)

				# copy file_groups and topics in each loop
				file_groups = pipeline_json_localfile["source"]["file_groups"]
				file_group_key = first_key(file_groups)
				master_file_groups[file_group_key] = file_groups[file_group_key]

				topics = pipeline_json_localfile["transform"]["topics"]
				topic_key = first_key(topics)
				master_topics[topic_key] = topics[topic_key]

				file_groups = pipeline_json_cos["source"]["file_groups"]
				file_group_key = first_key(file_groups)
				master_file_groups_cos[file_group_key] = file_groups[file_group_key]

				topics = pipeline_json_cos["transform"]["topics"]
				topic_key = first_key(topics)
				master_topics_cos[topic_key] = topics[topic_key]

if write_pipeline_files and write_consolidated_pipeline:
	# if writing consolidated ddl, clear out the old file since our function appends
	if os.path.exists(CONSOLIDATED_FILENAME):
		os.remove(CONSOLIDATED_FILENAME)

	write_master_pipeline(master_file_groups, master_topics)
	write_master_pipeline(master_file_groups_cos, master_topics_cos, "_cos")



