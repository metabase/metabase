# Example Dockerfile for creating Docker images which includes an H2 database
# (./h2dump.db) from which to initialize the Metabase database. It can be used
# to create Docker images for Elastic Beanstalk apps.
FROM metabase/metabase

COPY ./h2dump.db /app/initial.mv.db
