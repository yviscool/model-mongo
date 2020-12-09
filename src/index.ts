// Require dependencies
import MQuery from 'mquery';
import { MongoClient, ObjectId, Db } from 'mongodb';

import * as  Knex from 'knex';



const knex = Knex({
    client: 'mysql2',
    connection: {
        // debug: ['ComQueryPacket'],
        host: "39.98.203.72",
        user: "root",
        password: "chenxing2019",
        database: 'center'
    },
});

// knex('zjl').where({id:1}).first();


interface MongodbConfig {
    url: string;
    db?: string;
}

/**
 * MongoDb database plug class
 */
class ModelMongo {

    private _config: MongodbConfig;
    private _client: MongoClient;
    private _db: Db;
    private pts = [];
    building: Promise<void>;

    /**
     * Construct MongoDb database plug class
     */
    constructor(config: MongodbConfig) {
        // Store config
        this._config = config;

        // Bind builder to self
        this.build = this.build.bind(this);

        // Bind raw methods to self
        this.getRawDb = this.getRawDb.bind(this);
        this.getRawTable = this.getRawTable.bind(this);
        this.getRawCursor = this.getRawCursor.bind(this);

        // Bind internal methods to self
        this._queryToCursor = this._queryToCursor.bind(this);

        // Bind public methods to self
        this.raw = this.raw.bind(this);
        this.find = this.find.bind(this);
        this.count = this.count.bind(this);
        this.remove = this.remove.bind(this);
        this.insert = this.insert.bind(this);
        this.findOne = this.findOne.bind(this);
        this.findById = this.findById.bind(this);
        this.removeById = this.removeById.bind(this);
        this.replaceById = this.replaceById.bind(this);

        // Start building internal connections and store promise
        this.building = this.build();
    }

    /**
     * Async method that resolves on internal API build completion
     */
    async build() {
        // create client
        this._client = await new Promise((resolve, reject) => {
            // connect
            MongoClient.connect(this._config.url, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
                // reject
                if (err) return reject(err);

                // resolve client
                resolve(client);
            });
        });

        // Internally store db by name provided in config
        this._db = this._client.db(this._config.db);
    }

    /**
     * Prepare database for new collection of provided collection ID
     */
    initCollection() {
        // MongoDB just works, we dont need to do anything
    }

    async createIndex(collectionId, name: string, indexes: any) {
        await this.building;

        // TODO: please standardization i am suicidal
        try {
            await this._db.collection(collectionId).createIndex(indexes, {
                name,
            });
        } catch (err) { /* who care */ }
    }

    /**
    * Return a copy of a raw cursor by provided collectionId
    */
    async getRawCursor(collectionId) {
        await this.building;
        return MQuery(this._db.collection(collectionId));
    }

    /**
    * Return a copy of a raw table by provided collectionId
    */
    async getRawTable(collectionId) {
        await this.building;
        return this._db.collection(collectionId);
    }

    /**
    * Return a copy of the raw internal database
    */
    async getRawDb() {
        await this.building;
        return this._db;
    }

    /**
     * Convert a standard constructed query to an MQuery cursor
     */
    _queryToCursor(cursor, query) {
        let neBuf = [];

        // Iterate over all parts of the query
        for (const [queryPtKey, queryPt] of query.pts.entries()) {
            if (queryPt.type === 'filter') {
                const filter = Object.assign({}, queryPt.filter);

                // Iterate all values in the filter object
                for (const [filterKey, filterVal] of Object.entries(filter)) {
                    // If value data is a RegExp match, handle seperately
                    if (filterVal instanceof RegExp) {
                        // Delete by key from filter object
                        delete filter[filterKey];
                        // Apply key and regex match to `where` and `regex` cursor method
                        cursor = cursor.where(filterKey).regex(filterVal);
                    }
                }

                // Apply filter object to `where` cursor method
                cursor = cursor.where(filter);
            } else if (queryPt.type === 'elem') {
                if (typeof queryPt.filter !== 'object') {
                    // Apply supplied matches array to `where` and `elemMatch` cursor method
                    cursor = cursor.where(queryPt.arrKey).elemMatch({
                        $eq: queryPt.filter,
                    });
                } else {
                    // Apply supplied matches array to `where` and `elemMatch` cursor method
                    cursor = cursor.where(queryPt.arrKey).elemMatch(queryPt.filter);
                }
            } else if (queryPt.type === 'ne') {
                const nextPt = query.pts[queryPtKey + 1];

                if (nextPt != null && nextPt.type === 'ne' && nextPt.key === queryPt.key) {
                    neBuf.push(queryPt.val);
                } else if (neBuf.length > 0) {
                    // Apply supplied negative match and previous
                    // matches array to `where` and `nin` cursor method
                    cursor = cursor.where(queryPt.key).nin([...neBuf, queryPt.val]);
                    neBuf = [];
                } else {
                    // Apply supplied negative to `where` and `ne` cursor method
                    cursor = cursor.where(queryPt.key).ne(queryPt.val);
                }
            } else if (queryPt.type === 'nin') {
                // Apply supplied values array to `where` and `nin` cursor method
                cursor = cursor.where(queryPt.key).nin(queryPt.vals);
            } else if (queryPt.type === 'in') {
                // Apply supplied values array to `where` and `in` cursor method
                cursor = cursor.where(queryPt.key).in(queryPt.vals);
            } else if (queryPt.type === 'whereOr') {
                // Apply supplied matches array to `or` cursor method
                cursor = cursor.or(queryPt.matches);
            } else if (queryPt.type === 'whereAnd') {
                // Apply supplied matches array to `and` cursor method
                cursor = cursor.and(queryPt.matches);
            } else if (queryPt.type === 'limit') {
                // Apply amt to `limit` cursor method
                cursor = cursor.limit(queryPt.limitAmount);
            } else if (queryPt.type === 'skip') {
                // Apply amt to `skip` cursor method
                cursor = cursor.skip(queryPt.skipAmount);
            } else if (queryPt.type === 'sort') {
                // Apply custom sort filter object to `sort` cursor method
                cursor = cursor.sort({ [queryPt.sortKey]: queryPt.desc ? -1 : 1 });
            } else if (queryPt.type === 'gt') {
                // Apply key and max to `where` and `gt` cursor method
                cursor = cursor.where(queryPt.key).gt(queryPt.min);
            } else if (queryPt.type === 'lt') {
                // Apply key and max to `where` and `lt` cursor method
                cursor = cursor.where(queryPt.key).lt(queryPt.max);
            } else if (queryPt.type === 'gte') {
                // Apply key and max to `where` and `gte` cursor method
                cursor = cursor.where(queryPt.key).gte(queryPt.min);
            } else if (queryPt.type === 'lte') {
                // Apply key and max to `where` and `lte` cursor method
                cursor = cursor.where(queryPt.key).lte(queryPt.max);
            }
        }

        // Return the fully constructed cursor
        return cursor;
    }

    /**
     * Find Model data by collection ID and Model ID
     */
    async findById(collectionId, id) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Find single Model instance data by provided ID
        const rawModelRes = await mQuery.findOne({ _id: ObjectId(id) }).exec();

        // If no Model instance data found, return null
        if (rawModelRes == null) {
            return null;
        }

        // Get internal ID from returned data
        const fetchedModelId = rawModelRes._id.toString();

        // Delete internal ID from the object
        delete rawModelRes._id;

        // Get remaining now sanitized Model instance data
        const fetchedModelObject = rawModelRes;

        // Return correctly structured fetched Model instance data
        return {
            id: fetchedModelId,
            object: fetchedModelObject,
        };
    }

    /**
     * raw
     *
     * @param {*} collectionId
     * @param {*} query
     */
    raw(collectionId, query) {
        // Wait for building to finish
        this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Fetch, map, and return found Model instance
        // data found by cursor constructed from provided query
        return this._queryToCursor(mQuery, query)._pipeline;
    }

    /**
     * raw
     *
     * @param {*} collectionId
     * @param {*} query
     */
    exec(collectionId, action, ...args) {
        // Wait for building to finish
        this.building;

        // Construct MQuery cursor from collection ID
        const collection = this._db.collection(collectionId);

        // return promise
        return new Promise((resolve, reject) => {
            // execute
            collection[action](...args).toArray((err, data) => {
                // reject error
                if (err) return reject(err);

                // resolve
                resolve(data);
            });
        });
    }

    /**
     * Find Model data by collection ID and constructed query
     */
    async find(collectionId, query) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Fetch, map, and return found Model instance
        // data found by cursor constructed from provided query
        return (await this._queryToCursor(mQuery, query).find().exec()).map(rawModelRes => {
            // Get internal ID from returned data
            const fetchedModelId = rawModelRes._id.toString();

            // Delete internal ID from the object
            delete rawModelRes._id;

            // Get remaining now sanitized Model instance data
            const fetchedModelObject = rawModelRes;

            // Return correctly structured fetched Model instance data
            return {
                id: fetchedModelId,
                object: fetchedModelObject,
            };
        });
    }

    /**
     * Find single Model data by collection ID and Model ID
     */
    async findOne(collectionId, query) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Construct cursor from provided query, and use it to fetch single Model instance data
        const rawModelRes = await this._queryToCursor(mQuery, query).findOne().exec();

        // If no Model instance data found, return null
        if (rawModelRes == null) {
            return null;
        }

        // Get internal ID from returned data
        const fetchedModelId = rawModelRes._id.toString();

        // Delete internal ID from the object
        delete rawModelRes._id;

        // Get remaining now sanitized Model instance data
        const fetchedModelObject = rawModelRes;

        // Return correctly structured fetched Model instance data
        return {
            id: fetchedModelId,
            object: fetchedModelObject,
        };
    }

    /**
     * Get count of Model data by collection ID and constructed query
     */
    async count(collectionId, query) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Construct cursor from provided query, and use it
        // to fetch count of matching Model instance data
        return await this._queryToCursor(mQuery, query).count().exec();
    }

    /**
     * Get sum of data by provided key of all matching Model data
     * by collection ID and constructed query
     */
    async sum(collectionId, query, key) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Construct cursor from provided query, and use it to get sum
        // of data by provided key of all matching Model data
        return await this._queryToCursor(mQuery, query).sum(`$${key}`).exec();
    }

    /**
     * Remove matching Model data from database by collection ID and Model ID
     */
    async removeById(collectionId, id) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Find and remove single Model instance data by provided ID
        await mQuery.findOneAndRemove({ _id: ObjectId(id) }).exec();
    }

    /**
     * Remove matching Model data from database by collection ID and constructed query
     */
    async remove(collectionId, query) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Find and remove matching Model instance data by provided query
        await this._queryToCursor(mQuery, query).deleteMany().exec();
    }

    /**
     * Replace matching Model data from database by collection ID, Model ID, and replacement data
     */
    async replaceById(collectionId, id, newObject) {
        // Wait for building to finish
        await this.building;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Find and update Model instance data by provided ID and replacement object
        await mQuery.where({ _id: ObjectId(id) }).setOptions({ overwrite: true })
            .update(newObject).exec();
    }

    /**
     * Update matching Model data from database by collection ID, Model ID, replacement data,
     * and set of updated keys
     */
    async updateById(collectionId, id, newObject, updates) {
        // Wait for building to finish
        await this.building;

        // Filter to only top level key updates
        const topLevelUpdates = new Set(Array.from(updates).map(update => update.split('.')[0]));

        // Create new object for storing only updated keys
        const replaceObject = {};

        // Create new object for storing only unset keys
        const unsetObject = {};

        // Iterate updated keys
        for (const updatedKey of topLevelUpdates) {
            if (newObject[updatedKey] != null) {
                // Set replace object key-val to be from new object
                replaceObject[updatedKey] = newObject[updatedKey];
            } else {
                // Set field on unset object to be key from new object
                unsetObject[updatedKey] = 0;
            }
        }

        // Set mongodb-special field for unsetting fields
        if (Object.keys(unsetObject).length > 0) replaceObject.$unset = unsetObject;

        // Construct MQuery cursor from collection ID
        const mQuery = MQuery(this._db.collection(collectionId));

        // Find and update Model instance data by provided ID and replacement object
        await mQuery.where({ _id: ObjectId(id) }).update(replaceObject).exec();
    }

    /**
     * Insert Model data from database by collection ID and return Model ID
     */
    async insert(collectionId, object) {
        // Wait for building to finish
        await this.building;

        // Get DB collection from collection ID
        const collection = this._db.collection(collectionId);

        // Convert _id to ObjectId if present
        if (object._id !== null && object._id !== undefined) {
            object._id = ObjectId(object._id);
        }

        // Insert Model instance data into database and get inserted ID
        const id = (await collection.insertOne(object)).insertedId.toString();

        // Return ID of Model instance data in database
        return id;
    }


    /**
     * Set maximum returned Model instances
     */
    limit(amt) {
        // Push query part for `limit` and return self
        this.pts.push({ type: 'limit', limitAmount: amt });
        return this;
    }

    /**
     * Filter by if element matches in array
     */
    elem(arrKey, filter) {
        // Push query part for `elem` and return self
        this.pts.push({ type: 'elem', arrKey, filter });
        return this;
    }

    /**
     * Skip the first specified amount of returned Model instances
     */
    skip(amt) {
        // Push query part for `skip` and return self
        this.pts.push({ type: 'skip', skipAmount: amt });
        return this;
    }

    /**
     * Sort returned Model instances by a key and optional direction (default descending)
     */
    sort(key, directionStr = 'desc') {
        // Ensure directionStr is a String value
        directionStr = directionStr.toString();

        // Create scoped variable for wether the order is descending or not
        let desc = null;

        // Parse directionStr into value to apply to `desc`
        if (directionStr === '1' || directionStr === 'asc' || directionStr === 'ascending') {
            // Sort by ascending
            desc = false;
        } else if (directionStr === '-1' || directionStr === 'desc' || directionStr === 'descending') {
            // Sort by descending
            desc = true;
        } else {
            // directionStr is unparseable, so throw error
            throw new Error('Invalid sort value');
        }

        // Push query part for `sort` and return self
        this.pts.push({ type: 'sort', sortKey: key, desc });
        return this;
    }

    /**
     * search
     *
     * @param {*} value 
     */
    search(value) {
        // add to where
        this.pts.push({ type: 'filter', filter: { $text: { $search: value } } });
        return this;
    }

    /**
     * Filter only Model instances where the specified key matches
     * the specified val, can also be given a filter object
     */
    where(key, value = null) {
        // If only argument is an Object, handle as a filter object
        if (key instanceof Object && value == null) {
            // Handle arg
            const filter = key;
            // Push query part for `filter` and return self
            this.pts.push({ type: 'filter', filter: flatifyObj(filter) });
            return this;
        }


        // Push query part for `filter` and return self
        this.pts.push({ type: 'filter', filter: { [key]: value } });
        return this;
    }

    /**
     * Filter only Model instances where the specified key does not match the specified val
     */
    ne(key, value) {
        // Push query part for `ne` and return self
        this.pts.push({ type: 'ne', val: value, key });
        return this;
    }

    /**
     * Filter only Model instances where the specified keys do not match the specified val
     */
    nin(key, values) {
        // Push query part for `nin` and return self
        this.pts.push({ type: 'nin', vals: values, key });
        return this;
    }

    /**
     * Filter only Model instances where the specified keys match the specified val
     */
    in(key, values) {
        // Push query part for `in` and return self
        this.pts.push({ type: 'in', vals: values, key });
        return this;
    }

    /**
     * Alias of `where`
     */
    match(key, value = null) {
        return this.where(key, value);
    }

    /**
     * Filter only Model instances by filter using multiple
     * filter objects, where only one has to match
     */
    or(...matches) {
        // Push query part for `whereOr` and return self
        this.pts.push({ type: 'whereOr', matches: matches.map(match => flatifyObj(match)) });
        return this;
    }


    /**
     * Filter only Model instances by filter using multiple filter objects, where all have to match
     */
    and(...matches) {
        // Push query part for `whereAnd` and return self
        this.pts.push({ type: 'whereAnd', matches: matches.map(match => flatifyObj(match)) });
        return this;
    }

    /**
     * Only return Model instances where the value of the
     * specified key is greater than the specified amount
     */
    gt(key, min) {
        // Push query part for `gt` and return self
        this.pts.push({ type: 'gt', min, key });
        return this;
    }

    /**
     * Only return model instances where the value of the
     * specified key is less than the specified amount
     */
    lt(key, max) {
        // Push query part for `lt` and return self
        this.pts.push({ type: 'lt', max, key });
        return this;
    }

    /**
     * Only return Model instances where the value of the specified
     * key is greater or equal to than the specified amount
     */
    gte(key, min) {
        // Push query part for `gte` and return self
        this.pts.push({ type: 'gte', min, key });
        return this;
    }

    /**
     * Only return model instances where the value of the specified
     * key is less than or equal to the specified amount
     */
    lte(key, max) {
        // Push query part for `lte` and return self
        this.pts.push({ type: 'lte', max, key });
        return this;
    }

}

export default ModelMongo;
