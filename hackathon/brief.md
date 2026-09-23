We are at the metabase hackathon. Our team is working on semantic search

Libor is working on sqlite-based implementation
Paolo is working on lucene based implementation

My task is to build a comparison harness.
The goal is to execute the same thing against 3 implementations (2 new ones and old postgres) and
see the results.

Task split:
1. figure out how the setup would look like - how do we run an instance, populate data, execute queries
2. figure out what metrics/results we want to collect and how
3. figure out how do we present it (we should aim for metabase data app for increased wow factor)
4. prepare the dataset and evaluation scenarios
5. figure out if we use embedder as a comaprison axis (I lean on yes even though its orthogonal to the hackathon tasks)
6. ???
