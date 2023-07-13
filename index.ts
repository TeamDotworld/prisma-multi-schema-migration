import express from 'express'
import { PrismaClient } from '@prisma/client'
import chalk from 'chalk';
import fs from 'fs'

// @ts-ignore
import { Migrate } from '@prisma/migrate/dist/Migrate.js';
// @ts-ignore
import { ensureDatabaseExists } from '@prisma/migrate/dist/utils/ensureDatabaseExists';
// @ts-ignore
import { printFilesFromMigrationIds } from '@prisma/migrate/dist/utils/printFiles';

const app = express()

    const dbUrl:string = `postgresql://naveen:Mendal@localhost:5432/testing`


app.get('/migrate', async (req, res) => {

    const tenantId = req.query.tenantId as string;

    const schemaPath = `D:\\Projects\\nexino-projects\\constructly-backend\\prisma\\schema.prisma`;

    try {
        await createDbIfNotExists()
        const client = new PrismaClient();
        await client.$connect();

        // copy the original schema file, edit the datasource to point to the new DB with schema name

        const schema = fs.readFileSync(schemaPath, 'utf-8');
        const newSchema = schema.replace('env("DATABASE_URL")', `"${dbUrl}?schema=${tenantId}"`);

        // create a new schema file with the tenantId as the name
        const newSchemaPath = schemaPath.replace('schema.prisma', `${tenantId}.prisma`);
        // save the content
        fs.writeFileSync(newSchemaPath, newSchema);

        const migrate = new Migrate(newSchemaPath);


        // i don't think this really creates the DB and it's not documented
        const wasDbCreated = await ensureDatabaseExists('apply', newSchemaPath);
        if (wasDbCreated) {
            console.info(''); // empty line
            console.info(wasDbCreated);
        }

        const diagnoseResult = await migrate.diagnoseMigrationHistory({
            optInToShadowDatabase: false,
        });
        const listMigrationDirectoriesResult = await migrate.listMigrationDirectories();

        if (listMigrationDirectoriesResult.migrations.length > 0) {
            const migrations = listMigrationDirectoriesResult.migrations;
            console.info(`${migrations.length} migration${migrations.length > 1 ? 's' : ''} found in prisma/migrations`);
        } else {
            throw new Error(`No migrations found in prisma/migrations`);
        }


        const editedMigrationNames = diagnoseResult.editedMigrationNames;
        if (editedMigrationNames.length > 0) {
            console.info(
                `${chalk.yellow('WARNING The following migrations have been modified since they were applied:')}
${editedMigrationNames.join('\n')}`
            );
        }

        const { appliedMigrationNames: migrationIds } = await migrate.applyMigrations();

        migrate.stop();


        // delete the new schema file
        fs.unlinkSync(newSchemaPath);

        console.info(''); // empty line
        if (migrationIds.length === 0) {
            chalk.greenBright(`No pending migrations to apply.`);
            return res.json({
                status: false,
                message: 'No pending migrations to apply.'
            })
        } else {
            let msg = `The following migration${migrationIds.length > 1 ? 's' : ''} have been applied:\n\n${chalk(
                printFilesFromMigrationIds('migrations', migrationIds, {
                    'migration.sql': '',
                })
            )}`;
            return res.json({
                status: true,
                message: msg
            })
        }
    } catch (e: any) {
        console.log(e)
        return res.status(500).json({
            status: false,
            message: e.message
        })
    }



})


async function createDbIfNotExists() {


    // parse DB name from URL
    const dbName = dbUrl.split('/').pop();
    // remove params from name
    const dbNameNoParams = dbName?.split('?')[0];
    // sanitize name
    const dbNameSanitized = dbNameNoParams?.replace(/[^a-zA-Z0-9_]/g, '_');


     // temporarily set DB to postgres so we can connect
    // parse DSN
    const dsn = dbUrl.split('/');
    dsn.pop(); // remove DB name
    // set DB to postgres
    dsn.push('postgres');
    const dbUrlPostgres = dsn.join('/');


    const client = new PrismaClient({
        datasources: {
            db: {
                url: dbUrlPostgres
            }

        }
    })

    await client.$connect();
    const dbExists = await client.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM pg_database WHERE datname = '${dbNameSanitized}'`
    );

    if (!dbExists.length) {
        console.info(`Database ${dbNameSanitized} does not exist, creating...`);
        await client.$queryRawUnsafe(`CREATE DATABASE ${dbNameSanitized}`);
    }

}



const server = app.listen(3000)