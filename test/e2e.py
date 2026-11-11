# Основной сценарий в настоящем браузере. Запуск: python3 test/e2e.py
# Нужны playwright и Chrome. Сохраняет снимок экрана в test/screen.png.
import os, sys
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(root, 'index.html')
num = lambda page, i: int(page.inner_text('#' + i))

with sync_playwright() as pw:
    br = pw.chromium.launch(channel='chrome')
    page = br.new_page(viewport={'width': 1100, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url)
    total, att, over = num(page, 's-total'), num(page, 's-att'), num(page, 's-over')
    assert total == 27, total
    assert page.locator('#list article').count() == att, 'в списке ровно те, кому нужно внимание'
    page.screenshot(path=os.path.join(root, 'test', 'screen.png'), full_page=True)

    # 1. Записать разговор с итогом «думает об уходе»
    card = page.locator('#list article:has(button[data-act="form"])').nth(1)
    pid = card.get_attribute('data-pid')
    before = card.locator('.todo > li').count()
    leave = num(page, 's-leave')
    card.locator('button[data-act="form"]').first.click()
    page.check('form.form input[value="leave"]')
    page.fill('form.form textarea', 'Проверка <b>сценария</b>')
    page.click('form.form button[type="submit"]')
    assert num(page, 's-over') == over - 1, 'сорванных шагов стало на один меньше'
    assert num(page, 's-leave') == leave + 1
    card = page.locator('article[data-pid="%s"]' % pid)
    assert 'Проверка <b>сценария</b>' in card.inner_text(), 'заметка показана как текст, не как разметка'
    assert card.locator('.todo > li').count() == before - 1
    assert page.locator('#list article').nth(0).locator('.tag.crit').first.inner_text() == 'думает об уходе'

    # 2. Отметка переживает перезагрузку
    page.reload()
    assert num(page, 's-over') == over - 1 and num(page, 's-leave') == leave + 1

    # 3. Текст задачи для Битрикс24
    page.locator('button[data-act="task"]').first.click()
    assert 'Что сделать:' in page.input_value('textarea[readonly]')

    # 4. Выбор своего подразделения запоминается, «показать всех» работает
    page.select_option('#unit', 'wh-b')
    assert num(page, 's-total') == 6
    assert all('Склад, смена Б' in t for t in page.locator('#list article > div.muted.small').all_inner_texts())
    page.reload()
    assert page.input_value('#unit') == 'wh-b', 'выбор подразделения сохранился'
    page.select_option('#unit', 'all')
    page.check('#showall')
    assert page.locator('#list article').count() == 27
    page.uncheck('#showall')

    # 5. Сброс возвращает исходные числа
    page.click('summary')
    page.click('#reset')
    assert num(page, 's-over') == over and num(page, 's-att') == att

    # 6. Закрыть сигнал об уходе и отменить действие
    leave0, att0 = num(page, 's-leave'), num(page, 's-att')
    page.locator('button[data-act="resolve"]').first.click()
    assert num(page, 's-leave') == leave0 - 1
    page.click('button[data-act="undo"]')
    assert num(page, 's-leave') == leave0 and num(page, 's-att') == att0
    assert page.locator('#toast').is_hidden()

    # 7. Узкий экран без горизонтальной прокрутки
    page.set_viewport_size({'width': 380, 'height': 800})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'страница не уезжает вбок на телефоне'
    assert not errors, errors
    print('e2e ok: всего %d, внимание %d, сорвано шагов %d' % (total, att, over))
    br.close()
