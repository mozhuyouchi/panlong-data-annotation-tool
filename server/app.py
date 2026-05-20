#!/usr/bin/env python3
"""Flask API for annotation workbench data sharing."""

import json
import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, request, jsonify, g

app = Flask(__name__)
DB_PATH = os.environ.get(
    'ANNOTATION_DB_PATH',
    os.path.join(os.path.dirname(__file__), '..', 'data', 'annotation.db'),
)


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute(
            'CREATE TABLE IF NOT EXISTS meta ('
            '  key TEXT PRIMARY KEY,'
            '  value_json TEXT NOT NULL,'
            '  updated_at TEXT NOT NULL'
            ')'
        )
        g.db.execute(
            'CREATE TABLE IF NOT EXISTS templates ('
            '  template_key TEXT PRIMARY KEY,'
            '  value_json TEXT NOT NULL,'
            '  updated_at TEXT NOT NULL'
            ')'
        )
        g.db.execute(
            'CREATE TABLE IF NOT EXISTS attempts ('
            '  attempt_key TEXT PRIMARY KEY,'
            '  value_json TEXT NOT NULL,'
            '  updated_at TEXT NOT NULL'
            ')'
        )
        g.db.commit()
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()


@app.route('/api/health')
def health():
    db = get_db()
    t = db.execute('SELECT COUNT(*) FROM templates').fetchone()[0]
    a = db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0]
    return jsonify({'status': 'ok', 'template_count': t, 'attempt_count': a})


@app.route('/api/data', methods=['GET'])
def get_data():
    db = get_db()
    result = {'templates': {}, 'attempts': {}, 'cursors': None}

    row = db.execute("SELECT value_json FROM meta WHERE key='cursors'").fetchone()
    if row:
        result['cursors'] = json.loads(row['value_json'])

    for r in db.execute('SELECT template_key, value_json FROM templates').fetchall():
        result['templates'][r['template_key']] = json.loads(r['value_json'])

    for r in db.execute('SELECT attempt_key, value_json FROM attempts').fetchall():
        result['attempts'][r['attempt_key']] = json.loads(r['value_json'])

    return jsonify(result)


@app.route('/api/data', methods=['PUT'])
def put_data():
    db = get_db()
    body = request.get_json(force=True)
    now = datetime.now(timezone.utc).isoformat()

    if body.get('cursors') is not None:
        db.execute(
            "INSERT OR REPLACE INTO meta (key, value_json, updated_at) VALUES ('cursors', ?, ?)",
            (json.dumps(body['cursors'], ensure_ascii=False), now),
        )

    if body.get('templates'):
        for key, val in body['templates'].items():
            db.execute(
                'INSERT OR REPLACE INTO templates (template_key, value_json, updated_at) VALUES (?, ?, ?)',
                (key, json.dumps(val, ensure_ascii=False), now),
            )

    if body.get('attempts'):
        for key, val in body['attempts'].items():
            db.execute(
                'INSERT OR REPLACE INTO attempts (attempt_key, value_json, updated_at) VALUES (?, ?, ?)',
                (key, json.dumps(val, ensure_ascii=False), now),
            )

    db.commit()
    return jsonify({'ok': True})


if __name__ == '__main__':
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    app.run(host='127.0.0.1', port=5000, debug=False)
