import { INestApplication, Injectable, Scope } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { expect } from 'chai';
import * as request from 'supertest';
import { Guard } from '../src/transient/guards/request-scoped.guard';
import { HelloController } from '../src/transient/hello.controller';
import { HelloModule } from '../src/transient/hello.module';
import { Interceptor } from '../src/transient/interceptors/logging.interceptor';
import { UserByIdPipe } from '../src/transient/users/user-by-id.pipe';
import { UsersService } from '../src/transient/users/users.service';

class Meta {
  static COUNTER = 0;
  constructor() {
    Meta.COUNTER++;
  }
}

describe('Transient scope', () => {
  describe('when transient scope is used', () => {
    let server: any;
    let app: INestApplication;

    before(async () => {
      const module = await Test.createTestingModule({
        imports: [
          HelloModule.forRoot({
            provide: 'META',
            useClass: Meta,
            scope: Scope.TRANSIENT,
          }),
        ],
      }).compile();

      app = module.createNestApplication();
      server = app.getHttpServer();
      await app.init();
    });

    describe('and when one service is request scoped', () => {
      before(async () => {
        const performHttpCall = end =>
          request(server)
            .get('/hello')
            .end(err => {
              if (err) return end(err);
              end();
            });
        await new Promise<any>(resolve => performHttpCall(resolve));
        await new Promise<any>(resolve => performHttpCall(resolve));
        await new Promise<any>(resolve => performHttpCall(resolve));
      });

      it(`should create controller for each request`, () => {
        expect(HelloController.COUNTER).to.be.eql(3);
      });

      it(`should create service for each request`, () => {
        expect(UsersService.COUNTER).to.be.eql(3);
      });

      it(`should create provider for each inquirer`, () => {
        expect(Meta.COUNTER).to.be.eql(7);
      });

      it(`should create transient pipe for each controller (3 requests, 1 static)`, () => {
        expect(UserByIdPipe.COUNTER).to.be.eql(4);
      });

      it(`should create transient interceptor for each controller (3 requests, 1 static)`, () => {
        expect(Interceptor.COUNTER).to.be.eql(4);
      });

      it(`should create transient guard for each controller (3 requests, 1 static)`, () => {
        expect(Guard.COUNTER).to.be.eql(4);
      });
    });

    after(async () => {
      await app.close();
    });
  });

  describe('when there is a nested structure of transient providers', () => {
    let app: INestApplication;

    @Injectable({ scope: Scope.TRANSIENT })
    class DeepTransient {
      public initialized = false;

      constructor() {
        this.initialized = true;
      }
    }

    @Injectable({ scope: Scope.TRANSIENT })
    class LoggerService {
      public context?: string;
    }

    @Injectable({ scope: Scope.TRANSIENT })
    class SecondService {
      constructor(public readonly loggerService: LoggerService) {
        this.loggerService.context = 'SecondService';
      }
    }

    @Injectable()
    class FirstService {
      constructor(
        public readonly secondService: SecondService,
        public readonly loggerService: LoggerService,
        public readonly deepTransient: DeepTransient,
      ) {
        this.loggerService.context = 'FirstService';
      }
    }

    before(async () => {
      const module = await Test.createTestingModule({
        providers: [FirstService, SecondService, LoggerService, DeepTransient],
      }).compile();

      app = module.createNestApplication();
      await app.init();
    });

    it('should create a new instance of the transient provider for each provider', async () => {
      const firstService1 = app.get(FirstService);

      expect(firstService1.secondService.loggerService.context).to.equal(
        'SecondService',
      );
      expect(firstService1.loggerService.context).to.equal('FirstService');
      expect(firstService1.deepTransient.initialized).to.be.true;
    });

    after(async () => {
      await app.close();
    });
  });
});
