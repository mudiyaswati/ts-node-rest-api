import 'reflect-metadata';

import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as mongoose from 'mongoose';
import * as passport from 'passport';

import { IoC } from './src/api/ioc';
import { TYPES } from './src/api/ioc.types';
import { AuthMiddleware } from './src/api/middleware/auth.middleware';
import { BasicAuthFactory } from './src/api/middleware/basic-auth.middleware';
import { DigestAuthFactory } from './src/api/middleware/digest-auth.middleware';
import { ErrorMiddleware } from './src/api/middleware/error.middleware';
import { FacebookAuthFactory } from './src/api/middleware/facebook-auth.middleware';
import { GithubAuthFactory } from './src/api/middleware/github-auth.middleware';
import { GoogleAuthFactory } from './src/api/middleware/google-auth.middleware';
import { ModelBinder } from './src/api/model-binder';
import { RouteBinder } from './src/api/route-binder';
import * as ENV from './src/functions/env-funcs';
import { UserProviderInterface } from './src/providers/user.provider.interface';
import { UserServiceInterface } from './src/services/user.service.interface';

const app = express();
const port = process.env.PORT || 3000;
const env = (process.env.NODE_ENVIRONMENT || 'development').toLowerCase();
let environment = require(`./environments/env.js`).environment || {};
environment = ENV.mergeEnvironments(environment, (require(`./environments/env.${env}.js`).environment || {}));
environment.facebookId = environment.facebookId || process.env.FACEBOOK_CLIENT_ID || '';
environment.facebookSecret = environment.facebookSecret || process.env.FACEBOOK_CLIENT_SECRET || '';
environment.githubId = environment.githubId || process.env.GITHUB_CLIENT_ID || '';
environment.githubSecret = environment.githubSecret || process.env.GITHUB_CLIENT_SECRET || '';
environment.googleId = environment.googleId || process.env.GOOGLE_CLIENT_ID || '';
environment.googleSecret = environment.googleSecret || process.env.GOOGLE_CLIENT_SECRET || '';
console.log(environment);

// Create the model schemas
ModelBinder.initSchema();

// Setup mongoose
(mongoose as any).Promise = global.Promise;
mongoose.connect(environment.connectionString, {
    useMongoClient: true
});

// Configure the express app
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());

// Setup the IoC
const constants: { [key: string]: any } = {};
constants.encryptionKey = process.env.ENCRYPTION_KEY as string;
constants.sessionTimeout = environment.sessionTimeout;
const container = IoC.configureContainer(constants);

// Setup Authentication
const authMiddleware = new AuthMiddleware(
    [
        new BasicAuthFactory(),
        new DigestAuthFactory(),
        new FacebookAuthFactory(),
        new GithubAuthFactory(),
        new GoogleAuthFactory()
    ],
    environment,
    container.get<UserProviderInterface>(TYPES.UserProvider),
    container.get<UserServiceInterface>(TYPES.UserService)
);
authMiddleware.initialize(app);

// Register the routes
RouteBinder.configureRoutes(app, container, authMiddleware);
app.get('/auth/strategies', (req, res) => {
    res.json(authMiddleware.getEnabledAuthStrategies());
});

// Add Middleware
const errorMiddleware = new ErrorMiddleware(environment);
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => errorMiddleware.notFound(req, res, next));
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) =>
    errorMiddleware.internalServerError(environment, err, req, res, next));

try {
    app.listen(port);
}
catch (err) {
    console.error(`Failed to listen on port ${port}. Set the environment variable PORT to run on a different port.`)
}

console.log('todo list RESTful API server started on: ' + port);
